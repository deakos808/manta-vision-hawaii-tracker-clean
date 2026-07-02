import {
  QcContext,
  DomainResult,
  Finding,
  addNoDatabaseFinding,
  countDuplicateValues,
  hasTable,
  indexBy,
  loadRows,
  truthy,
} from "./qc_common";

const SIZE_VIEW_NAMES = [
  "v_sizes_summary_stats_v3",
  "v_sizes_quadrant_stats_v3",
  "v_sizes_manta_rows_v1",
  "v_sizes_card_rows_v3",
  "v_catalog_size_history",
];

const SIZE_MEASUREMENT_TABLE = "manta_sizes";
const MEAN_TOLERANCE_M = 0.02;

async function tryLoadRows(ctx: QcContext, relation: string, wantedColumns?: string[]) {
  if (!ctx.supabase) {
    return {
      rows: [] as Record<string, unknown>[],
      available: false,
      error: "Supabase credentials were not available.",
    };
  }

  const columns = wantedColumns?.length ? wantedColumns.join(",") : "*";
  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await ctx.supabase.from(relation).select(columns).range(from, from + pageSize - 1);
    if (error) return { rows: [] as Record<string, unknown>[], available: false, error: error.message };
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < pageSize) break;
  }
  return { rows, available: true };
}

function addViewUnavailableFinding(domain: string, viewName: string, error?: string): Finding {
  return {
    domain,
    severity: "warning",
    check_name: "size_browser_view_available",
    table_name: viewName,
    message: `Sizes browser view '${viewName}' could not be read; part of the Sizes QC was skipped.`,
    suggested_action: error
      ? `Confirm the view exists and is selectable. Supabase said: ${error}`
      : "Confirm the view exists and is selectable.",
  };
}

function plausibleSize(value: unknown) {
  const sizeValue = Number(value);
  if (!Number.isFinite(sizeValue)) return null;
  return sizeValue;
}

function mean(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function checkSizes(ctx: QcContext): Promise<DomainResult> {
  const domain = "sizes";
  const checked_at = new Date().toISOString();
  const findings: Finding[] = [];
  if (!ctx.supabase) findings.push(addNoDatabaseFinding(domain));
  if (!ctx.supabase) return { domain, checked_at, summary: { rows_checked: 0 }, findings };

  const mantas = hasTable(ctx, "mantas") ? await loadRows(ctx, "mantas") : [];
  const mantaById = indexBy(mantas, "pk_manta_id");
  const catalog = hasTable(ctx, "catalog") ? indexBy(await loadRows(ctx, "catalog", ["pk_catalog_id"]), "pk_catalog_id") : new Map();
  const sizeMeasurements = await tryLoadRows(ctx, SIZE_MEASUREMENT_TABLE);

  if (!sizeMeasurements.available) {
    findings.push({
      domain,
      severity: "warning",
      check_name: "size_measurement_table_available",
      table_name: SIZE_MEASUREMENT_TABLE,
      message: `Child size measurement table '${SIZE_MEASUREMENT_TABLE}' could not be read; size measurement checks were skipped.`,
      suggested_action: sizeMeasurements.error
        ? `Confirm the table exists and is selectable. Supabase said: ${sizeMeasurements.error}`
        : "Confirm the table exists and is selectable.",
    });
  }

  const lengthSizesByManta = new Map<string, number[]>();
  if (sizeMeasurements.available) {
    for (const row of sizeMeasurements.rows) {
      if (row.pk_manta_size_id == null || row.pk_manta_size_id === "") {
        findings.push({
          domain,
          severity: "error",
          check_name: "size_measurement_primary_key_present",
          table_name: SIZE_MEASUREMENT_TABLE,
          message: "Size measurement row is missing pk_manta_size_id.",
        });
      }

      if (row.fk_manta_id == null || row.fk_manta_id === "") {
        findings.push({
          domain,
          severity: "error",
          check_name: "size_measurement_manta_fk_present",
          table_name: SIZE_MEASUREMENT_TABLE,
          primary_key: row.pk_manta_size_id as string | number | null,
          message: `Size measurement ${row.pk_manta_size_id} has no fk_manta_id.`,
        });
      } else {
        const mantaId = String(row.fk_manta_id);
        const manta = mantaById.get(mantaId);
        if (mantaById.size > 0 && !manta) {
          findings.push({
            domain,
            severity: "error",
            check_name: "size_measurement_manta_fk_exists",
            table_name: SIZE_MEASUREMENT_TABLE,
            primary_key: row.pk_manta_size_id as string | number | null,
            related_manta_id: row.fk_manta_id as string | number | null,
            message: `Size measurement ${row.pk_manta_size_id} links to missing manta ${row.fk_manta_id}.`,
          });
        } else if (manta) {
          if ((manta.fk_catalog_id == null || manta.fk_catalog_id === "") && !truthy(manta.catalog_unknown)) {
            findings.push({
              domain,
              severity: "error",
              check_name: "size_measurement_manta_catalog_fk_present",
              table_name: SIZE_MEASUREMENT_TABLE,
              primary_key: row.pk_manta_size_id as string | number | null,
              related_manta_id: row.fk_manta_id as string | number | null,
              message: `Size measurement ${row.pk_manta_size_id} links to manta ${row.fk_manta_id}, but that manta has no fk_catalog_id.`,
              suggested_action: "Review the manta encounter and link it to the correct catalog individual, or mark the manta catalog_unknown after identity review.",
            });
          } else if (catalog.size > 0 && !catalog.has(String(manta.fk_catalog_id))) {
            findings.push({
              domain,
              severity: "error",
              check_name: "size_measurement_manta_catalog_fk_exists",
              table_name: SIZE_MEASUREMENT_TABLE,
              primary_key: row.pk_manta_size_id as string | number | null,
              related_manta_id: row.fk_manta_id as string | number | null,
              related_catalog_id: manta.fk_catalog_id as string | number | null,
              message: `Size measurement ${row.pk_manta_size_id} links to manta ${row.fk_manta_id}, whose fk_catalog_id ${manta.fk_catalog_id} is missing from catalog.`,
            });
          }
        }
      }

      const sizeValue = plausibleSize(row.size_m);
      if (sizeValue == null) {
        findings.push({
          domain,
          severity: "warning",
          check_name: "size_measurement_value_present",
          table_name: SIZE_MEASUREMENT_TABLE,
          primary_key: row.pk_manta_size_id as string | number | null,
          related_manta_id: row.fk_manta_id as string | number | null,
          message: `Size measurement ${row.pk_manta_size_id} has no numeric size_m value.`,
        });
      } else {
        if (row.fk_manta_id != null && row.fk_manta_id !== "") {
          const mantaId = String(row.fk_manta_id);
          const measurementType = String(row.measurement_type ?? "").trim().toLowerCase();
          if (measurementType === "length") {
            const list = lengthSizesByManta.get(mantaId) ?? [];
            list.push(sizeValue);
            lengthSizesByManta.set(mantaId, list);
          }
        }

        if (sizeValue <= 0 || sizeValue > 8) {
          findings.push({
            domain,
            severity: "warning",
            check_name: "size_measurement_value_plausible",
            table_name: SIZE_MEASUREMENT_TABLE,
            primary_key: row.pk_manta_size_id as string | number | null,
            related_manta_id: row.fk_manta_id as string | number | null,
            message: `Size measurement ${row.pk_manta_size_id} has size_m=${sizeValue}, outside the greater-than-0m to 8m review range.`,
          });
        }
      }
    }

    for (const [id, count] of countDuplicateValues(sizeMeasurements.rows, "pk_manta_size_id")) {
      findings.push({
        domain,
        severity: "error",
        check_name: "size_measurement_primary_key_unique",
        table_name: SIZE_MEASUREMENT_TABLE,
        primary_key: id,
        message: `Size measurement ID ${id} appears ${count} times.`,
      });
    }
  }

  for (const [mantaId, childSizes] of lengthSizesByManta.entries()) {
    const manta = mantaById.get(mantaId);
    const childMean = mean(childSizes);
    const storedMean = plausibleSize(manta?.size_m);
    if (childMean == null || storedMean == null) continue;

    if (Math.abs(childMean - storedMean) > MEAN_TOLERANCE_M) {
      findings.push({
        domain,
        severity: "warning",
        check_name: "manta_size_matches_child_measurement_mean",
        table_name: "mantas",
        primary_key: mantaId,
        related_manta_id: mantaId,
        message: `Manta ${mantaId} stores size_m=${storedMean.toFixed(3)} but child measurements average ${childMean.toFixed(3)} across ${childSizes.length} rows.`,
        suggested_action: "Review the child measurements and confirm whether the manta encounter mean should be updated.",
      });
    }
  }

  for (const row of mantas) {
    const mantaId = row.pk_manta_id == null ? "" : String(row.pk_manta_id);
    const hasChildSizes = lengthSizesByManta.has(mantaId);
    if (!hasChildSizes) continue;

    if (row.pk_manta_id == null || row.pk_manta_id === "") {
      findings.push({
        domain,
        severity: "error",
        check_name: "manta_size_primary_key_present",
        table_name: "mantas",
        message: "Manta row with child size measurements is missing pk_manta_id.",
      });
    }

    const sizeValue = plausibleSize(row.size_m);
    if (sizeValue == null) {
      findings.push({
        domain,
        severity: "warning",
        check_name: "manta_size_mean_present",
        table_name: "mantas",
        primary_key: row.pk_manta_id as string | number | null,
        related_manta_id: row.pk_manta_id as string | number | null,
        message: `Manta ${row.pk_manta_id} has child size measurements but no stored size_m mean.`,
      });
    } else if (sizeValue <= 0 || sizeValue > 8) {
      findings.push({
        domain,
        severity: "warning",
        check_name: "manta_size_mean_plausible",
        table_name: "mantas",
        primary_key: row.pk_manta_id as string | number | null,
        related_manta_id: row.pk_manta_id as string | number | null,
        message: `Manta ${row.pk_manta_id} has stored size_m=${sizeValue}, outside the greater-than-0m to 8m review range.`,
      });
    }

    for (const column of ["estimated_size_m", "jon_size_m", "size_disc_len_m"]) {
      if (!(column in row) || row[column] == null || row[column] === "") continue;
      const otherSize = plausibleSize(row[column]);
      if (otherSize != null && otherSize !== 0 && (otherSize < 1 || otherSize > 8)) {
        findings.push({
          domain,
          severity: "warning",
          check_name: "manta_size_value_plausible",
          table_name: "mantas",
          primary_key: row.pk_manta_id as string | number | null,
          related_manta_id: row.pk_manta_id as string | number | null,
          message: `Manta ${row.pk_manta_id} has ${column}=${otherSize}, outside the 1m to 8m review range.`,
        });
      }
    }
  }

  const browserViews: Record<string, number> = {};
  for (const viewName of SIZE_VIEW_NAMES) {
    const result = await tryLoadRows(ctx, viewName);
    if (!result.available) {
      findings.push(addViewUnavailableFinding(domain, viewName, result.error));
      continue;
    }
    browserViews[viewName] = result.rows.length;

    if (viewName === "v_sizes_manta_rows_v1") {
      for (const row of result.rows) {
        if (row.pk_manta_id == null || row.pk_manta_id === "") {
          findings.push({
            domain,
            severity: "error",
            check_name: "size_browser_manta_pk_present",
            table_name: viewName,
            message: "Sizes browser row is missing pk_manta_id.",
          });
        }
        if (row.pk_manta_id != null && mantaById.size > 0 && !mantaById.has(String(row.pk_manta_id))) {
          findings.push({
            domain,
            severity: "error",
            check_name: "size_browser_manta_fk_exists",
            table_name: viewName,
            primary_key: row.pk_manta_id as string | number | null,
            related_manta_id: row.pk_manta_id as string | number | null,
            message: `Sizes browser row references missing manta ${row.pk_manta_id}.`,
          });
        }

        const sizeValue = plausibleSize(row.manta_size_m);
        if (sizeValue != null && (sizeValue < 1 || sizeValue > 8)) {
          findings.push({
            domain,
            severity: "warning",
            check_name: "size_browser_value_plausible",
            table_name: viewName,
            primary_key: row.pk_manta_id as string | number | null,
            related_manta_id: row.pk_manta_id as string | number | null,
            related_catalog_id: row.fk_catalog_id as string | number | null,
            related_sighting_id: row.fk_sighting_id as string | number | null,
            message: `Sizes browser row for manta ${row.pk_manta_id} has manta_size_m=${sizeValue}, outside the 1m to 8m review range.`,
          });
        }
      }
      for (const [id, count] of countDuplicateValues(result.rows, "pk_manta_id")) {
        findings.push({
          domain,
          severity: "warning",
          check_name: "size_browser_manta_row_unique",
          table_name: viewName,
          primary_key: id,
          related_manta_id: id,
          message: `Sizes browser view has ${count} rows for manta ${id}.`,
        });
      }
    }

    if (viewName === "v_catalog_size_history") {
      for (const row of result.rows) {
        const meanValue = plausibleSize(row.mean_m);
        if (meanValue != null && (meanValue < 1 || meanValue > 8)) {
          findings.push({
            domain,
            severity: "warning",
            check_name: "size_history_mean_plausible",
            table_name: viewName,
            related_catalog_id: row.fk_catalog_id as string | number | null,
            message: `Catalog ${row.fk_catalog_id} size history has mean_m=${meanValue}, outside the 1m to 8m review range.`,
          });
        }
      }
    }
  }

  return {
    domain,
    checked_at,
    summary: {
      manta_rows_checked: mantas.length,
      size_measurement_rows: sizeMeasurements.available ? sizeMeasurements.rows.length : 0,
      mantas_with_length_measurements: lengthSizesByManta.size,
      browser_views_checked: Object.keys(browserViews).length,
      browser_view_rows: browserViews,
    },
    findings,
  };
}
