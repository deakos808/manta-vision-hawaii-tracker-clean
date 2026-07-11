import {
  QcContext,
  DomainResult,
  Finding,
  addMissingTableFinding,
  addNoDatabaseFinding,
  countDuplicateValues,
  hasColumn,
  hasTable,
  indexBy,
  loadRows,
  truthy,
} from "./qc_common";

function hasText(value: unknown) {
  return value != null && String(value).trim() !== "";
}

export async function checkBiopsies(ctx: QcContext): Promise<DomainResult> {
  const domain = "biopsies";
  const checked_at = new Date().toISOString();
  const findings: Finding[] = [];
  if (!hasTable(ctx, "biopsies")) findings.push(addMissingTableFinding(domain, "biopsies"));
  if (!ctx.supabase) findings.push(addNoDatabaseFinding(domain));
  if (!hasTable(ctx, "biopsies") || !ctx.supabase) return { domain, checked_at, summary: { rows_checked: 0 }, findings };

  const biopsies = await loadRows(ctx, "biopsies");
  const mantas = hasTable(ctx, "mantas")
    ? indexBy(await loadRows(ctx, "mantas", ["pk_manta_id", "fk_catalog_id", "fk_sighting_id", "catalog_unknown", "no_ventral_photos", "no_photos_expected"]), "pk_manta_id")
    : new Map();
  const sightings = hasTable(ctx, "sightings") ? indexBy(await loadRows(ctx, "sightings", ["pk_sighting_id"]), "pk_sighting_id") : new Map();
  const catalog = hasTable(ctx, "catalog") ? indexBy(await loadRows(ctx, "catalog", ["pk_catalog_id"]), "pk_catalog_id") : new Map();
  const photos = hasTable(ctx, "photos") ? await loadRows(ctx, "photos", ["pk_photo_id", "fk_manta_id"]) : [];
  const sizes = hasTable(ctx, "manta_sizes") ? await loadRows(ctx, "manta_sizes", ["pk_manta_size_id", "fk_manta_id"]) : [];
  const photoCountsByManta = countBy(photos, "fk_manta_id");
  const sizeCountsByManta = countBy(sizes, "fk_manta_id");
  const sampleIdColumns = ["sample_id", "raw_sample_id", "lab_id", "ref_biopsy_id"].filter((name) => hasColumn(ctx, "biopsies", name));

  for (const row of biopsies) {
    const primaryKey = row.pk_biopsy_id as string | number | null;
    if (row.pk_biopsy_id == null || row.pk_biopsy_id === "") {
      findings.push({
        domain,
        severity: "error",
        check_name: "biopsy_primary_key_present",
        table_name: "biopsies",
        message: "Biopsy row is missing pk_biopsy_id.",
      });
    }

    const manta = row.fk_manta_id == null ? null : mantas.get(String(row.fk_manta_id));
    const acceptedNoVentralCatalogException = truthy(manta?.catalog_unknown) && truthy(manta?.no_ventral_photos);

    if (row.fk_manta_id == null || row.fk_manta_id === "") {
      findings.push({
        domain,
        severity: "error",
        check_name: "biopsy_manta_fk_present",
        table_name: "biopsies",
        primary_key: primaryKey,
        message: `Biopsy ${row.pk_biopsy_id} has no fk_manta_id.`,
        suggested_action: "Link the biopsy to the manta encounter where the sample was collected.",
      });
    } else if (mantas.size > 0 && !manta) {
      findings.push({
        domain,
        severity: "error",
        check_name: "biopsy_manta_fk_exists",
        table_name: "biopsies",
        primary_key: primaryKey,
        related_manta_id: row.fk_manta_id as string | number | null,
        message: `Biopsy ${row.pk_biopsy_id} links to missing manta ${row.fk_manta_id}.`,
      });
    } else if (manta) {
      const photoCount = photoCountsByManta.get(String(row.fk_manta_id)) ?? 0;
      const acceptedNoPhotoException = truthy(manta.no_photos_expected) || truthy(manta.no_ventral_photos);
      if (photos.length > 0 && photoCount === 0 && !acceptedNoPhotoException) {
        findings.push({
          domain,
          severity: "error",
          check_name: "biopsy_manta_has_child_photos",
          table_name: "biopsies",
          primary_key: primaryKey,
          related_manta_id: row.fk_manta_id as string | number | null,
          message: `Biopsy ${row.pk_biopsy_id} links to manta ${row.fk_manta_id}, but that manta has no child photo rows.`,
          suggested_action: "Confirm the sampled manta encounter is correct, then link or recover the child photo rows for that manta encounter.",
        });
      }

      if (manta.fk_sighting_id != null && row.fk_sighting_id != null && String(row.fk_sighting_id) !== String(manta.fk_sighting_id)) {
        findings.push({
          domain,
          severity: "error",
          check_name: "biopsy_sighting_fk_matches_manta",
          table_name: "biopsies",
          primary_key: primaryKey,
          related_manta_id: row.fk_manta_id as string | number | null,
          related_sighting_id: row.fk_sighting_id as string | number | null,
          message: `Biopsy ${row.pk_biopsy_id} has fk_sighting_id ${row.fk_sighting_id}, but linked manta ${row.fk_manta_id} has fk_sighting_id ${manta.fk_sighting_id}.`,
          suggested_action: "Keep biopsy sighting links synchronized with the sampled manta encounter.",
        });
      }

      if (manta.fk_catalog_id != null && row.fk_catalog_id != null && String(row.fk_catalog_id) !== String(manta.fk_catalog_id)) {
        findings.push({
          domain,
          severity: "error",
          check_name: "biopsy_catalog_fk_matches_manta",
          table_name: "biopsies",
          primary_key: primaryKey,
          related_manta_id: row.fk_manta_id as string | number | null,
          related_catalog_id: row.fk_catalog_id as string | number | null,
          message: `Biopsy ${row.pk_biopsy_id} has fk_catalog_id ${row.fk_catalog_id}, but linked manta ${row.fk_manta_id} has fk_catalog_id ${manta.fk_catalog_id}.`,
          suggested_action: "Keep biopsy catalog links synchronized with the sampled manta encounter.",
        });
      }
    }

    if (row.fk_sighting_id == null || row.fk_sighting_id === "") {
      findings.push({
        domain,
        severity: "error",
        check_name: "biopsy_sighting_fk_present",
        table_name: "biopsies",
        primary_key: primaryKey,
        related_manta_id: row.fk_manta_id as string | number | null,
        message: `Biopsy ${row.pk_biopsy_id} has no fk_sighting_id.`,
        suggested_action: "Link the biopsy to the survey/sighting where the sample was collected.",
      });
    } else if (sightings.size > 0 && !sightings.has(String(row.fk_sighting_id))) {
      findings.push({
        domain,
        severity: "error",
        check_name: "biopsy_sighting_fk_exists",
        table_name: "biopsies",
        primary_key: primaryKey,
        related_manta_id: row.fk_manta_id as string | number | null,
        related_sighting_id: row.fk_sighting_id as string | number | null,
        message: `Biopsy ${row.pk_biopsy_id} links to missing sighting ${row.fk_sighting_id}.`,
      });
    }

    if (row.fk_catalog_id == null || row.fk_catalog_id === "") {
      if (!acceptedNoVentralCatalogException) {
        findings.push({
          domain,
          severity: "error",
          check_name: "biopsy_catalog_fk_present",
          table_name: "biopsies",
          primary_key: primaryKey,
          related_manta_id: row.fk_manta_id as string | number | null,
          message: `Biopsy ${row.pk_biopsy_id} has no fk_catalog_id.`,
          suggested_action: "Link the biopsy to the sampled catalog individual, or mark the sampled manta encounter catalog_unknown and no_ventral_photos when no ventral ID was available.",
        });
      }
    } else if (catalog.size > 0 && !catalog.has(String(row.fk_catalog_id))) {
      findings.push({
        domain,
        severity: "error",
        check_name: "biopsy_catalog_fk_exists",
        table_name: "biopsies",
        primary_key: primaryKey,
        related_manta_id: row.fk_manta_id as string | number | null,
        related_catalog_id: row.fk_catalog_id as string | number | null,
        message: `Biopsy ${row.pk_biopsy_id} links to missing catalog ${row.fk_catalog_id}.`,
      });
    }
  }

  for (const column of ["pk_biopsy_id", ...sampleIdColumns]) {
    for (const [id, count] of countDuplicateValues(biopsies, column)) {
      findings.push({
        domain,
        severity: column === "pk_biopsy_id" ? "error" : "warning",
        check_name: `biopsy_${column}_unique`,
        table_name: "biopsies",
        primary_key: id,
        message: `${column} ${id} appears ${count} times.`,
      });
    }
  }

  return {
    domain,
    checked_at,
    summary: {
      biopsy_rows: biopsies.length,
      biopsies_with_external_sample_id: biopsies.filter((row) => sampleIdColumns.some((column) => hasText(row[column]))).length,
      biopsies_linked_to_mantas_with_photos: biopsies.filter((row) => {
        const mantaId = row.fk_manta_id;
        return mantaId != null && photoCountsByManta.has(String(mantaId));
      }).length,
      biopsies_linked_to_mantas_with_sizes: biopsies.filter((row) => {
        const mantaId = row.fk_manta_id;
        return mantaId != null && sizeCountsByManta.has(String(mantaId));
      }).length,
    },
    findings,
  };
}

function countBy(rows: Record<string, unknown>[], column: string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[column];
    if (value == null || value === "") continue;
    const key = String(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
