import {
  QcContext,
  DomainResult,
  Finding,
  addMissingTableFinding,
  addNoDatabaseFinding,
  countDuplicateValues,
  hasColumn,
  hasTable,
  isNoVentralAvailableException,
  isVentral,
  indexBy,
  loadRows,
  normalize,
  truthy,
} from "./qc_common";
import { isAcceptedDorsalCatalogAnchor } from "./qc_exceptions";

const VALID_GENDERS = new Set(["male", "female", "unknown", "undetermined", ""]);
const VALID_AGES = new Set(["adult", "juvenile", "subadult", "young", "unknown", ""]);
const VALID_POPULATIONS = new Set(["big island", "maui-nui", "maui nui", "oahu", "kauai", "unknown", ""]);

export async function checkCatalog(ctx: QcContext): Promise<DomainResult> {
  const domain = "catalog";
  const findings: Finding[] = [];
  const checked_at = new Date().toISOString();

  if (!hasTable(ctx, "catalog")) findings.push(addMissingTableFinding(domain, "catalog"));
  if (!ctx.supabase) findings.push(addNoDatabaseFinding(domain));
  if (!hasTable(ctx, "catalog") || !ctx.supabase) {
    return { domain, checked_at, summary: { rows_checked: 0 }, findings };
  }

  const catalogRows = await loadRows(ctx, "catalog");
  const catalogById = indexBy(catalogRows, "pk_catalog_id");
  const photoRows = hasTable(ctx, "photos") ? await loadRows(ctx, "photos") : [];

  for (const row of catalogRows) {
    if (row.pk_catalog_id == null || row.pk_catalog_id === "") {
      findings.push({
        domain,
        severity: "error",
        check_name: "catalog_primary_key_present",
        table_name: "catalog",
        message: "Catalog row is missing pk_catalog_id.",
        suggested_action: "Review the source import row and assign or repair the catalog primary key.",
      });
    }
  }

  for (const [id, count] of countDuplicateValues(catalogRows, "pk_catalog_id")) {
    findings.push({
      domain,
      severity: "error",
      check_name: "catalog_primary_key_unique",
      table_name: "catalog",
      primary_key: id,
      related_catalog_id: id,
      message: `Catalog ID ${id} appears ${count} times.`,
      suggested_action: "Inspect duplicate catalog records before merging or deleting anything.",
    });
  }

  const bestCatalogPhotos = photoRows.filter((row) => truthy(row.is_best_catalog_ventral_photo));
  const bestByCatalog = new Map<string, Record<string, unknown>[]>();
  for (const photo of bestCatalogPhotos) {
    const catalogId = photo.fk_catalog_id;
    if (catalogId == null) {
      findings.push({
        domain,
        severity: "error",
        check_name: "best_catalog_photo_has_catalog",
        table_name: "photos",
        primary_key: photo.pk_photo_id as string | number | null,
        related_photo_id: photo.pk_photo_id as string | number | null,
        message: `Photo ${photo.pk_photo_id ?? "unknown"} is marked best catalog ventral but has no fk_catalog_id.`,
        suggested_action: "Link the photo to the intended catalog or clear the best-catalog flag after review.",
      });
      continue;
    }
    const key = String(catalogId);
    if (!bestByCatalog.has(key)) bestByCatalog.set(key, []);
    bestByCatalog.get(key)!.push(photo);
  }

  for (const [catalogId, photos] of bestByCatalog.entries()) {
    if (photos.length > 1) {
      findings.push({
        domain,
        severity: "error",
        check_name: "one_best_catalog_ventral_per_catalog",
        table_name: "photos",
        related_catalog_id: catalogId,
        message: `Catalog ${catalogId} has ${photos.length} photos flagged as best catalog ventral.`,
        suggested_action: "Use the best catalog photo admin tool to choose one ventral anchor.",
        metadata: { photo_ids: photos.map((photo) => photo.pk_photo_id) },
      });
    }
  }

  for (const photo of bestCatalogPhotos) {
    const catalogRow = photo.fk_catalog_id == null ? null : catalogById.get(String(photo.fk_catalog_id));
    const hasAcceptedException =
      isNoVentralAvailableException(catalogRow?.best_catalog_photo_exception_reason) ||
      isAcceptedDorsalCatalogAnchor(photo.pk_photo_id);
    if (!isVentral(photo) && !hasAcceptedException) {
      findings.push({
        domain,
        severity: "warning",
        check_name: "best_catalog_photo_is_ventral",
        table_name: "photos",
        primary_key: photo.pk_photo_id as string | number | null,
        related_photo_id: photo.pk_photo_id as string | number | null,
        related_catalog_id: photo.fk_catalog_id as string | number | null,
        message: `Photo ${photo.pk_photo_id ?? "unknown"} is best catalog ventral but photo_view/view_label is '${photo.photo_view ?? photo.view_label ?? "blank"}'.`,
        suggested_action: "Confirm the view label or choose a ventral best-catalog photo.",
      });
    }
  }

  for (const row of catalogRows) {
    if (hasColumn(ctx, "catalog", "gender") && !VALID_GENDERS.has(normalize(row.gender))) {
      findings.push({
        domain,
        severity: "warning",
        check_name: "catalog_gender_known_value",
        table_name: "catalog",
        primary_key: row.pk_catalog_id as string | number | null,
        related_catalog_id: row.pk_catalog_id as string | number | null,
        message: `Catalog ${row.pk_catalog_id} has unexpected gender '${row.gender}'.`,
        suggested_action: "Compare against accepted catalog gender values.",
      });
    }
    if (hasColumn(ctx, "catalog", "age_class") && !VALID_AGES.has(normalize(row.age_class))) {
      findings.push({
        domain,
        severity: "warning",
        check_name: "catalog_age_class_known_value",
        table_name: "catalog",
        primary_key: row.pk_catalog_id as string | number | null,
        related_catalog_id: row.pk_catalog_id as string | number | null,
        message: `Catalog ${row.pk_catalog_id} has unexpected age class '${row.age_class}'.`,
        suggested_action: "Compare against accepted catalog age class values.",
      });
    }
    for (const column of ["population", "island", "sitelocation"]) {
      if (hasColumn(ctx, "catalog", column) && !VALID_POPULATIONS.has(normalize(row[column]))) {
        findings.push({
          domain,
          severity: "warning",
          check_name: `catalog_${column}_known_value`,
          table_name: "catalog",
          primary_key: row.pk_catalog_id as string | number | null,
          related_catalog_id: row.pk_catalog_id as string | number | null,
          message: `Catalog ${row.pk_catalog_id} has unexpected ${column} '${row[column]}'. Use 'Big Island' for Hawaii Island.`,
          suggested_action: "Review the value against known island/population labels.",
        });
      }
    }
  }

  return {
    domain,
    checked_at,
    summary: {
      catalog_rows: catalogRows.length,
      best_catalog_ventral_photos: bestCatalogPhotos.length,
      catalogs_with_best_ventral_photo: bestByCatalog.size,
      no_ventral_available_exceptions: catalogRows.filter((row) =>
        isNoVentralAvailableException(row.best_catalog_photo_exception_reason),
      ).length,
    },
    findings,
  };
}
