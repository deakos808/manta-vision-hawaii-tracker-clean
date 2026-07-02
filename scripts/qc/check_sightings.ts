import { QcContext, DomainResult, Finding, addMissingTableFinding, addNoDatabaseFinding, countDuplicateValues, hasColumn, hasTable, indexBy, loadRows, normalize } from "./qc_common";

const ISLAND_TO_POPULATION: Record<string, string> = {
  "big island": "Big Island",
  maui: "Maui Nui",
  molokai: "Maui Nui",
  kahoolawe: "Maui Nui",
  lanai: "Maui Nui",
  oahu: "Oahu",
  kauai: "Kauai",
  niihau: "Kauai",
};

const VALID_ISLANDS = new Set([...Object.keys(ISLAND_TO_POPULATION), "unknown", ""]);

function expectedPopulationForIsland(value: unknown) {
  return ISLAND_TO_POPULATION[normalize(value)];
}

function isLocationUnknown(row: Record<string, unknown>) {
  return row.location_unknown === true || row.location_unknown === "true" || row.location_unknown === 1 || row.location_unknown === "1";
}

function parseCoordinate(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseMantaIdList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => Number(item)).filter((n) => Number.isFinite(n) && n > 0);
  return Array.from(String(value ?? "").matchAll(/\d+/g))
    .map((match) => Number(match[0]))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function sourceLabel(row: Record<string, unknown> | undefined) {
  if (!row) return "Missing";
  return row.is_mprf === true || row.is_mprf === "true" || row.is_mprf === 1 || row.is_mprf === "1" ? "MPRF" : "HAMER";
}

function isMprfSighting(row: Record<string, unknown>) {
  return sourceLabel(row) === "MPRF" || normalize(row.source) === "mprf";
}

function sightingSummary(row: Record<string, unknown> | undefined, dateColumn: string) {
  if (!row) {
    return {
      id: "",
      source: "Missing",
      date: "",
      photographer: "",
      total_mantas: "",
    };
  }

  return {
    id: row.pk_sighting_id ?? "",
    source: sourceLabel(row),
    date: row[dateColumn] ?? row.date ?? row.sighting_date ?? "",
    start_time: row.start_time ?? "",
    end_time: row.end_time ?? "",
    island: row.island ?? "",
    population: row.population ?? "",
    location: row.sitelocation ?? row.location ?? "",
    latitude: row.latitude ?? "",
    longitude: row.longitude ?? "",
    photographer: row.photographer ?? row.organization ?? "",
    organization: row.organization ?? "",
    total_mantas: row.total_mantas ?? row.total_manta_ids ?? "",
  };
}

export async function checkSightings(ctx: QcContext): Promise<DomainResult> {
  const domain = "sightings";
  const checked_at = new Date().toISOString();
  const findings: Finding[] = [];

  if (!hasTable(ctx, "sightings")) findings.push(addMissingTableFinding(domain, "sightings"));
  if (!ctx.supabase) findings.push(addNoDatabaseFinding(domain));
  if (!hasTable(ctx, "sightings") || !ctx.supabase) return { domain, checked_at, summary: { rows_checked: 0 }, findings };

  const sightings = await loadRows(ctx, "sightings");
  const sightingsById = indexBy(sightings, "pk_sighting_id");
  const mantaRows = hasTable(ctx, "mantas")
    ? await loadRows(ctx, "mantas", ["pk_manta_id", "fk_sighting_id", "fk_catalog_id", "name", "is_mprf"])
    : [];
  const mantasById = indexBy(mantaRows, "pk_manta_id");
  const dateColumn = hasColumn(ctx, "sightings", "sighting_date") ? "sighting_date" : "date";
  const locationColumns = ["location", "sitelocation", "location_id"].filter((column) => hasColumn(ctx, "sightings", column));
  const mantaPkListColumns = ["list_manta_ids_2"].filter((column) => hasColumn(ctx, "sightings", column));

  for (const sighting of sightings) {
    if (sighting.pk_sighting_id == null || sighting.pk_sighting_id === "") {
      findings.push({ domain, severity: "error", check_name: "sighting_primary_key_present", table_name: "sightings", message: "Sighting row is missing pk_sighting_id." });
    }
    if (!sighting[dateColumn]) {
      findings.push({
        domain,
        severity: "error",
        check_name: "sighting_required_date_present",
        table_name: "sightings",
        primary_key: sighting.pk_sighting_id as string | number | null,
        related_sighting_id: sighting.pk_sighting_id as string | number | null,
        message: `Sighting ${sighting.pk_sighting_id} is missing ${dateColumn}.`,
        suggested_action: "Review the sighting source record and add the sighting date.",
      });
    }
    if (
      locationColumns.length > 0 &&
      locationColumns.every((column) => !sighting[column]) &&
      !isLocationUnknown(sighting)
    ) {
      findings.push({
        domain,
        severity: "warning",
        check_name: "sighting_location_present",
        table_name: "sightings",
        primary_key: sighting.pk_sighting_id as string | number | null,
        related_sighting_id: sighting.pk_sighting_id as string | number | null,
        message: `Sighting ${sighting.pk_sighting_id} has no populated location field.`,
        suggested_action: "Add or repair location metadata before using location-based analytics.",
      });
    }
    if (hasColumn(ctx, "sightings", "island") && !VALID_ISLANDS.has(normalize(sighting.island))) {
      findings.push({
        domain,
        severity: normalize(sighting.island) === "hawaii" ? "error" : "warning",
        check_name: "sighting_island_known_value",
        table_name: "sightings",
        primary_key: sighting.pk_sighting_id as string | number | null,
        related_sighting_id: sighting.pk_sighting_id as string | number | null,
        message: `Sighting ${sighting.pk_sighting_id} has unexpected island '${sighting.island}'.`,
        suggested_action: normalize(sighting.island) === "hawaii" ? "Set island to Big Island." : "Review the island/location lookup values.",
      });
    }
    if (
      hasColumn(ctx, "sightings", "island") &&
      hasColumn(ctx, "sightings", "population") &&
      expectedPopulationForIsland(sighting.island) &&
      normalize(sighting.population) !== normalize(expectedPopulationForIsland(sighting.island))
    ) {
      const expectedPopulation = expectedPopulationForIsland(sighting.island)!;
      findings.push({
        domain,
        severity: "warning",
        check_name: "sighting_island_population_mapping",
        table_name: "sightings",
        primary_key: sighting.pk_sighting_id as string | number | null,
        related_sighting_id: sighting.pk_sighting_id as string | number | null,
        message: `Sighting ${sighting.pk_sighting_id} has island '${sighting.island ?? "blank"}' but population '${sighting.population ?? "blank"}'. Expected population is '${expectedPopulation}'.`,
        suggested_action: `Set population to ${expectedPopulation}.`,
      });
    }
    if (hasColumn(ctx, "sightings", "latitude") && hasColumn(ctx, "sightings", "longitude") && !isLocationUnknown(sighting)) {
      const latitude = parseCoordinate(sighting.latitude);
      const longitude = parseCoordinate(sighting.longitude);
      if (latitude == null || longitude == null) {
        findings.push({
          domain,
          severity: "warning",
          check_name: "sighting_map_coordinates_present",
          table_name: "sightings",
          primary_key: sighting.pk_sighting_id as string | number | null,
          related_sighting_id: sighting.pk_sighting_id as string | number | null,
          message: `Sighting ${sighting.pk_sighting_id} is missing latitude/longitude needed for the map icon.`,
          suggested_action: "Add verified coordinates or mark the location as verified unknown if that workflow is enabled.",
        });
      } else if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        findings.push({
          domain,
          severity: "error",
          check_name: "sighting_map_coordinates_valid",
          table_name: "sightings",
          primary_key: sighting.pk_sighting_id as string | number | null,
          related_sighting_id: sighting.pk_sighting_id as string | number | null,
          message: `Sighting ${sighting.pk_sighting_id} has invalid map coordinates latitude=${sighting.latitude}, longitude=${sighting.longitude}.`,
          suggested_action: "Correct latitude/longitude before using this sighting on maps.",
        });
      }
    }

    const listedMantaPkIds = Array.from(
      new Set(mantaPkListColumns.flatMap((column) => parseMantaIdList(sighting[column]))),
    );
    for (const mantaId of listedMantaPkIds) {
      const manta = mantasById.get(String(mantaId));
      if (!manta) {
        findings.push({
          domain,
          severity: "error",
          check_name: "listed_manta_id_has_manta_row",
          table_name: "sightings",
          primary_key: sighting.pk_sighting_id as string | number | null,
          related_manta_id: mantaId,
          related_sighting_id: sighting.pk_sighting_id as string | number | null,
          message: `Sighting ${sighting.pk_sighting_id} lists manta ${mantaId}, but no mantas.pk_manta_id row exists.`,
          suggested_action: "Create or repair the manta encounter row for this listed individual.",
        });
      } else if (String(manta.fk_sighting_id ?? "") !== String(sighting.pk_sighting_id ?? "")) {
        const pointedSighting = sightingsById.get(String(manta.fk_sighting_id ?? ""));
        const isMprfListedSighting = isMprfSighting(sighting);
        findings.push({
          domain,
          severity: "error",
          check_name: "listed_manta_row_links_back_to_sighting",
          table_name: "mantas",
          primary_key: mantaId,
          related_manta_id: mantaId,
          related_sighting_id: sighting.pk_sighting_id as string | number | null,
          message: `Sighting ${sighting.pk_sighting_id} lists manta ${mantaId}, but that manta row points to sighting ${manta.fk_sighting_id ?? "blank"}.`,
          suggested_action: isMprfListedSighting
            ? "Reconcile this MPRF sighting from list_manta_ids_2: move listed manta rows to this sighting, merge duplicate manta rows when needed, and sync total_mantas/list fields. Keep both sightings unless the sightings are truly duplicates."
            : "Repair mantas.fk_sighting_id or the sighting list of observed mantas after review.",
          metadata: {
            mismatch_type: "listed_manta_points_to_other_sighting",
            repair_strategy: isMprfListedSighting ? "reconcile_mprf_manta_list" : "review_manta_sighting_link",
            list_source_column: "list_manta_ids_2",
            listed_manta_id: mantaId,
            listed_sighting_id: sighting.pk_sighting_id,
            pointed_sighting_id: manta.fk_sighting_id ?? null,
            manta_catalog_id: manta.fk_catalog_id ?? null,
            manta_name: manta.name ?? null,
            listed_sighting: sightingSummary(sighting, dateColumn),
            manta_points_to_sighting: sightingSummary(pointedSighting, dateColumn),
          },
        });
      }
    }
  }

  for (const [id, count] of countDuplicateValues(sightings, "pk_sighting_id")) {
    findings.push({ domain, severity: "error", check_name: "sighting_primary_key_unique", table_name: "sightings", primary_key: id, related_sighting_id: id, message: `Sighting ID ${id} appears ${count} times.` });
  }

  return {
    domain,
    checked_at,
    summary: {
      sighting_rows: sightings.length,
      location_columns: locationColumns,
      manta_pk_list_columns: mantaPkListColumns,
    },
    findings,
  };
}
