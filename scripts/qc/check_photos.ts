import { QcContext, DomainResult, Finding, addMissingTableFinding, addNoDatabaseFinding, countDuplicateValues, hasTable, indexBy, isNoVentralAvailableException, isVentral, loadRows, normalize, truthy } from "./qc_common";
import { isAcceptedDorsalCatalogAnchor } from "./qc_exceptions";

const VALID_VIEWS = new Set(["ventral", "dorsal", "other", "left", "right", "head", "tail", "unknown", ""]);

export async function checkPhotos(ctx: QcContext): Promise<DomainResult> {
  const domain = "photos";
  const checked_at = new Date().toISOString();
  const findings: Finding[] = [];

  if (!hasTable(ctx, "photos")) findings.push(addMissingTableFinding(domain, "photos"));
  if (!ctx.supabase) findings.push(addNoDatabaseFinding(domain));
  if (!hasTable(ctx, "photos") || !ctx.supabase) return { domain, checked_at, summary: { rows_checked: 0 }, findings };

  const photos = await loadRows(ctx, "photos");
  const catalogs = hasTable(ctx, "catalog") ? indexBy(await loadRows(ctx, "catalog"), "pk_catalog_id") : new Map();
  const mantas = hasTable(ctx, "mantas") ? indexBy(await loadRows(ctx, "mantas", ["pk_manta_id", "fk_catalog_id", "fk_sighting_id", "no_ventral_photos"]), "pk_manta_id") : new Map();
  const sightings = hasTable(ctx, "sightings") ? indexBy(await loadRows(ctx, "sightings", ["pk_sighting_id"]), "pk_sighting_id") : new Map();

  const bestMantaVentral = new Map<string, Record<string, unknown>[]>();
  const bestCatalogVentral = new Map<string, Record<string, unknown>[]>();
  const mantaIdsWithVentralPhotos = new Set(
    photos
      .filter((photo) => photo.fk_manta_id != null && isVentral(photo))
      .map((photo) => String(photo.fk_manta_id)),
  );

  for (const photo of photos) {
    if (photo.pk_photo_id == null || photo.pk_photo_id === "") {
      findings.push({ domain, severity: "error", check_name: "photo_primary_key_present", table_name: "photos", message: "Photo row is missing pk_photo_id." });
    }
    if (photo.fk_catalog_id != null && catalogs.size > 0 && !catalogs.has(String(photo.fk_catalog_id))) {
      findings.push({ domain, severity: "error", check_name: "photo_catalog_fk_exists", table_name: "photos", primary_key: photo.pk_photo_id as string | number | null, related_photo_id: photo.pk_photo_id as string | number | null, related_catalog_id: photo.fk_catalog_id as string | number | null, message: `Photo ${photo.pk_photo_id} links to missing catalog ${photo.fk_catalog_id}.` });
    }
    if (photo.fk_manta_id == null || photo.fk_manta_id === "") {
      findings.push({ domain, severity: "error", check_name: "photo_manta_fk_present", table_name: "photos", primary_key: photo.pk_photo_id as string | number | null, related_photo_id: photo.pk_photo_id as string | number | null, message: `Photo ${photo.pk_photo_id} is not linked to a manta row.`, suggested_action: "Assign this photo to the correct manta encounter so it inherits sighting and catalog context." });
    } else if (mantas.size > 0) {
      const mantaRow = mantas.get(String(photo.fk_manta_id));
      if (!mantaRow) {
        findings.push({ domain, severity: "error", check_name: "photo_manta_fk_exists", table_name: "photos", primary_key: photo.pk_photo_id as string | number | null, related_photo_id: photo.pk_photo_id as string | number | null, related_manta_id: photo.fk_manta_id as string | number | null, message: `Photo ${photo.pk_photo_id} links to missing manta ${photo.fk_manta_id}.` });
      } else {
        const noVentralCatalogException =
          truthy(mantaRow.no_ventral_photos) && !mantaIdsWithVentralPhotos.has(String(photo.fk_manta_id));
        if ((mantaRow.fk_catalog_id == null || mantaRow.fk_catalog_id === "") && !noVentralCatalogException) {
          findings.push({ domain, severity: "error", check_name: "photo_manta_catalog_link_present", table_name: "photos", primary_key: photo.pk_photo_id as string | number | null, related_photo_id: photo.pk_photo_id as string | number | null, related_manta_id: photo.fk_manta_id as string | number | null, message: `Photo ${photo.pk_photo_id} links to manta ${photo.fk_manta_id}, but that manta has no catalog ID.`, suggested_action: "Set mantas.fk_catalog_id so this photo maps back to a catalog record, or mark the manta encounter as no_ventral_photos when only dorsal/other photos exist." });
        } else if (mantaRow.fk_catalog_id != null && mantaRow.fk_catalog_id !== "" && catalogs.size > 0 && !catalogs.has(String(mantaRow.fk_catalog_id))) {
          findings.push({ domain, severity: "error", check_name: "photo_manta_catalog_fk_exists", table_name: "photos", primary_key: photo.pk_photo_id as string | number | null, related_photo_id: photo.pk_photo_id as string | number | null, related_manta_id: photo.fk_manta_id as string | number | null, related_catalog_id: mantaRow.fk_catalog_id as string | number | null, message: `Photo ${photo.pk_photo_id} links to manta ${photo.fk_manta_id}, but that manta points to missing catalog ${mantaRow.fk_catalog_id}.`, suggested_action: "Repair mantas.fk_catalog_id or the missing catalog row." });
        }
        if (mantaRow.fk_sighting_id == null || mantaRow.fk_sighting_id === "") {
          findings.push({ domain, severity: "error", check_name: "photo_manta_sighting_link_present", table_name: "photos", primary_key: photo.pk_photo_id as string | number | null, related_photo_id: photo.pk_photo_id as string | number | null, related_manta_id: photo.fk_manta_id as string | number | null, message: `Photo ${photo.pk_photo_id} links to manta ${photo.fk_manta_id}, but that manta has no sighting ID.`, suggested_action: "Set mantas.fk_sighting_id so this photo maps back to an encounter sighting." });
        } else if (sightings.size > 0 && !sightings.has(String(mantaRow.fk_sighting_id))) {
          findings.push({ domain, severity: "error", check_name: "photo_manta_sighting_fk_exists", table_name: "photos", primary_key: photo.pk_photo_id as string | number | null, related_photo_id: photo.pk_photo_id as string | number | null, related_manta_id: photo.fk_manta_id as string | number | null, related_sighting_id: mantaRow.fk_sighting_id as string | number | null, message: `Photo ${photo.pk_photo_id} links to manta ${photo.fk_manta_id}, but that manta points to missing sighting ${mantaRow.fk_sighting_id}.`, suggested_action: "Repair mantas.fk_sighting_id or the missing sighting row." });
        }
      }
    }
    if (photo.fk_sighting_id != null && sightings.size > 0 && !sightings.has(String(photo.fk_sighting_id))) {
      findings.push({ domain, severity: "error", check_name: "photo_sighting_fk_exists", table_name: "photos", primary_key: photo.pk_photo_id as string | number | null, related_photo_id: photo.pk_photo_id as string | number | null, related_sighting_id: photo.fk_sighting_id as string | number | null, message: `Photo ${photo.pk_photo_id} links to missing sighting ${photo.fk_sighting_id}.` });
    }
    if (!VALID_VIEWS.has(normalize(photo.photo_view))) {
      findings.push({ domain, severity: "warning", check_name: "photo_view_known_value", table_name: "photos", primary_key: photo.pk_photo_id as string | number | null, related_photo_id: photo.pk_photo_id as string | number | null, message: `Photo ${photo.pk_photo_id} has unexpected photo_view '${photo.photo_view}'.` });
    }
    if (!photo.storage_path) {
      findings.push({ domain, severity: "warning", check_name: "photo_storage_path_present", table_name: "photos", primary_key: photo.pk_photo_id as string | number | null, related_photo_id: photo.pk_photo_id as string | number | null, message: `Photo ${photo.pk_photo_id} has no storage_path.`, suggested_action: "Confirm whether this is a legacy/local-only photo or repair storage metadata." });
    }
    if (truthy(photo.is_best_catalog_ventral_photo)) {
      const key = String(photo.fk_catalog_id ?? "missing");
      if (!bestCatalogVentral.has(key)) bestCatalogVentral.set(key, []);
      bestCatalogVentral.get(key)!.push(photo);
      const catalogRow = photo.fk_catalog_id == null ? null : catalogs.get(String(photo.fk_catalog_id));
      if (!isVentral(photo) && !isNoVentralAvailableException(catalogRow?.best_catalog_photo_exception_reason) && !isAcceptedDorsalCatalogAnchor(photo.pk_photo_id)) findings.push({ domain, severity: "warning", check_name: "best_catalog_ventral_has_ventral_view", table_name: "photos", primary_key: photo.pk_photo_id as string | number | null, related_photo_id: photo.pk_photo_id as string | number | null, related_catalog_id: photo.fk_catalog_id as string | number | null, message: `Photo ${photo.pk_photo_id} is best catalog ventral but is not labeled ventral.` });
    }
    if (truthy(photo.is_best_manta_ventral_photo)) {
      const key = String(photo.fk_manta_id ?? "missing");
      if (!bestMantaVentral.has(key)) bestMantaVentral.set(key, []);
      bestMantaVentral.get(key)!.push(photo);
      const mantaRow = photo.fk_manta_id == null ? null : mantas.get(String(photo.fk_manta_id));
      const acceptedNoVentralFallback =
        truthy(mantaRow?.no_ventral_photos) && !mantaIdsWithVentralPhotos.has(key);
      if (!isVentral(photo) && !acceptedNoVentralFallback) findings.push({ domain, severity: "warning", check_name: "best_manta_ventral_has_ventral_view", table_name: "photos", primary_key: photo.pk_photo_id as string | number | null, related_photo_id: photo.pk_photo_id as string | number | null, related_manta_id: photo.fk_manta_id as string | number | null, message: `Photo ${photo.pk_photo_id} is best manta ventral but is not labeled ventral.`, suggested_action: "Set the photo view to ventral, choose a ventral best photo, or mark the manta encounter as no_ventral_photos when no ventral photos exist." });
    }
  }

  for (const [id, count] of countDuplicateValues(photos, "pk_photo_id")) {
    findings.push({ domain, severity: "error", check_name: "photo_primary_key_unique", table_name: "photos", primary_key: id, related_photo_id: id, message: `Photo ID ${id} appears ${count} times.` });
  }
  for (const [catalogId, rows] of bestCatalogVentral.entries()) {
    if (catalogId !== "missing" && rows.length > 1) findings.push({ domain, severity: "error", check_name: "one_best_catalog_ventral_per_catalog", table_name: "photos", related_catalog_id: catalogId, message: `Catalog ${catalogId} has ${rows.length} best catalog ventral photos.`, metadata: { photo_ids: rows.map((row) => row.pk_photo_id) } });
  }
  for (const [mantaId, rows] of bestMantaVentral.entries()) {
    if (mantaId !== "missing" && rows.length > 1) findings.push({ domain, severity: "error", check_name: "one_best_manta_ventral_per_manta", table_name: "photos", related_manta_id: mantaId, message: `Manta ${mantaId} has ${rows.length} best manta ventral photos.`, metadata: { photo_ids: rows.map((row) => row.pk_photo_id) } });
  }

  return { domain, checked_at, summary: { photo_rows: photos.length, best_catalog_ventral: Array.from(bestCatalogVentral.values()).flat().length, best_manta_ventral: Array.from(bestMantaVentral.values()).flat().length, no_ventral_photo_exceptions: Array.from(mantas.values()).filter((row) => truthy(row.no_ventral_photos)).length }, findings };
}
