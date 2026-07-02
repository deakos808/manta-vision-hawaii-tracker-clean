import { QcContext, DomainResult, Finding, addMissingTableFinding, addNoDatabaseFinding, countDuplicateValues, hasColumn, hasTable, indexBy, isVentral, loadRows, truthy } from "./qc_common";

export async function checkMantas(ctx: QcContext): Promise<DomainResult> {
  const domain = "mantas";
  const checked_at = new Date().toISOString();
  const findings: Finding[] = [];

  if (!hasTable(ctx, "mantas")) findings.push(addMissingTableFinding(domain, "mantas"));
  if (!ctx.supabase) findings.push(addNoDatabaseFinding(domain));
  if (!hasTable(ctx, "mantas") || !ctx.supabase) return { domain, checked_at, summary: { rows_checked: 0 }, findings };

  const mantas = await loadRows(ctx, "mantas");
  const catalogs = hasTable(ctx, "catalog") ? indexBy(await loadRows(ctx, "catalog", ["pk_catalog_id"]), "pk_catalog_id") : new Map();
  const sightings = hasTable(ctx, "sightings") ? indexBy(await loadRows(ctx, "sightings", ["pk_sighting_id"]), "pk_sighting_id") : new Map();
  const photos = hasTable(ctx, "photos") ? await loadRows(ctx, "photos", ["pk_photo_id", "fk_manta_id", "photo_view"]) : [];
  const photoCountsByManta = new Map<string, number>();
  const mantaIdsWithVentralPhotos = new Set<string>();
  for (const photo of photos) {
    if (photo.fk_manta_id == null || photo.fk_manta_id === "") continue;
    const key = String(photo.fk_manta_id);
    photoCountsByManta.set(key, (photoCountsByManta.get(key) ?? 0) + 1);
    if (isVentral(photo)) mantaIdsWithVentralPhotos.add(key);
  }

  const noPhotosExpectedAvailable = hasColumn(ctx, "mantas", "no_photos_expected");
  if (!noPhotosExpectedAvailable) {
    findings.push({
      domain,
      severity: "warning",
      check_name: "manta_no_photos_expected_column_available",
      table_name: "mantas",
      message: "mantas.no_photos_expected is not available, so QC cannot distinguish expected no-photo import rows from records needing photo review.",
      suggested_action: "Add mantas.no_photos_expected boolean not null default false, then rerun QC.",
    });
  }
  const catalogUnknownAvailable = hasColumn(ctx, "mantas", "catalog_unknown");
  if (!catalogUnknownAvailable) {
    findings.push({
      domain,
      severity: "warning",
      check_name: "manta_catalog_unknown_column_available",
      table_name: "mantas",
      message: "mantas.catalog_unknown is not available, so QC cannot record reviewed unknown catalog identities separately from no-photo import rows.",
      suggested_action: "Add mantas.catalog_unknown boolean not null default false, then rerun QC.",
    });
  }
  const noVentralPhotosAvailable = hasColumn(ctx, "mantas", "no_ventral_photos");
  if (!noVentralPhotosAvailable) {
    findings.push({
      domain,
      severity: "warning",
      check_name: "manta_no_ventral_photos_column_available",
      table_name: "mantas",
      message: "mantas.no_ventral_photos is not available, so QC cannot distinguish reviewed dorsal-only encounters from records needing catalog ID review.",
      suggested_action: "Apply the mantas.no_ventral_photos migration, then rerun QC.",
    });
  }

  for (const manta of mantas) {
    const mantaId = String(manta.pk_manta_id ?? "");
    const linkedPhotoCount = mantaId ? photoCountsByManta.get(mantaId) ?? 0 : 0;
    const noPhotosExpected = truthy(manta.no_photos_expected);
    const catalogUnknown = truthy(manta.catalog_unknown);
    const noVentralPhotos = truthy(manta.no_ventral_photos);
    const hasVentralPhoto = mantaId ? mantaIdsWithVentralPhotos.has(mantaId) : false;
    const noVentralCatalogException = noVentralPhotos && !hasVentralPhoto;

    if (manta.pk_manta_id == null || manta.pk_manta_id === "") {
      findings.push({ domain, severity: "error", check_name: "manta_primary_key_present", table_name: "mantas", message: "Manta row is missing pk_manta_id." });
    }
    if (noPhotosExpected && linkedPhotoCount > 0) {
      findings.push({
        domain,
        severity: "warning",
        check_name: "manta_no_photos_expected_matches_photo_links",
        table_name: "mantas",
        primary_key: manta.pk_manta_id as string | number | null,
        related_manta_id: manta.pk_manta_id as string | number | null,
        message: `Manta ${manta.pk_manta_id} is marked no_photos_expected but has ${linkedPhotoCount} linked photo(s).`,
        suggested_action: "Clear no_photos_expected if photos now exist for this manta encounter.",
      });
    }
    if (noVentralPhotos && hasVentralPhoto) {
      findings.push({
        domain,
        severity: "warning",
        check_name: "manta_no_ventral_photos_matches_ventral_photo_links",
        table_name: "mantas",
        primary_key: manta.pk_manta_id as string | number | null,
        related_manta_id: manta.pk_manta_id as string | number | null,
        message: `Manta ${manta.pk_manta_id} is marked no_ventral_photos but has linked ventral photo(s).`,
        suggested_action: "Clear no_ventral_photos if a usable ventral ID photo is now linked to this manta encounter.",
      });
    }

    const missingCatalog = manta.fk_catalog_id == null || manta.fk_catalog_id === "";
    if (missingCatalog && !noPhotosExpected && !catalogUnknown && !noVentralCatalogException) {
      findings.push({
        domain,
        severity: "error",
        check_name: "manta_catalog_fk_present",
        table_name: "mantas",
        primary_key: manta.pk_manta_id as string | number | null,
        related_manta_id: manta.pk_manta_id as string | number | null,
        message: `Manta ${manta.pk_manta_id} has no fk_catalog_id.`,
        suggested_action: "Link this manta encounter to the correct catalog record, mark catalog_unknown after identity review, mark no_ventral_photos when only dorsal/other photos exist, or mark no_photos_expected only when this is an import-only manta with no photos.",
      });
    } else if (!missingCatalog && catalogUnknown) {
      findings.push({
        domain,
        severity: "warning",
        check_name: "manta_catalog_unknown_matches_catalog_link",
        table_name: "mantas",
        primary_key: manta.pk_manta_id as string | number | null,
        related_manta_id: manta.pk_manta_id as string | number | null,
        related_catalog_id: manta.fk_catalog_id as string | number | null,
        message: `Manta ${manta.pk_manta_id} is marked catalog_unknown but links to catalog ${manta.fk_catalog_id}.`,
        suggested_action: "Clear catalog_unknown if this catalog identity is now confirmed.",
      });
    } else if (!missingCatalog && catalogs.size > 0 && !catalogs.has(String(manta.fk_catalog_id))) {
      findings.push({
        domain,
        severity: "error",
        check_name: "manta_catalog_fk_exists",
        table_name: "mantas",
        primary_key: manta.pk_manta_id as string | number | null,
        related_manta_id: manta.pk_manta_id as string | number | null,
        related_catalog_id: manta.fk_catalog_id as string | number | null,
        message: `Manta ${manta.pk_manta_id} links to missing catalog ${manta.fk_catalog_id}.`,
        suggested_action: "Repair the catalog link after review.",
      });
    }
    if (manta.fk_sighting_id == null || manta.fk_sighting_id === "") {
      findings.push({
        domain,
        severity: "error",
        check_name: "manta_sighting_fk_present",
        table_name: "mantas",
        primary_key: manta.pk_manta_id as string | number | null,
        related_manta_id: manta.pk_manta_id as string | number | null,
        message: `Manta ${manta.pk_manta_id} has no fk_sighting_id.`,
        suggested_action: "Link this manta encounter to the correct sighting record.",
      });
    } else if (sightings.size > 0 && !sightings.has(String(manta.fk_sighting_id))) {
      findings.push({
        domain,
        severity: "error",
        check_name: "manta_sighting_fk_exists",
        table_name: "mantas",
        primary_key: manta.pk_manta_id as string | number | null,
        related_manta_id: manta.pk_manta_id as string | number | null,
        related_sighting_id: manta.fk_sighting_id as string | number | null,
        message: `Manta ${manta.pk_manta_id} links to missing sighting ${manta.fk_sighting_id}.`,
        suggested_action: "Repair the sighting link after review.",
      });
    }
  }

  for (const [id, count] of countDuplicateValues(mantas, "pk_manta_id")) {
    findings.push({ domain, severity: "error", check_name: "manta_primary_key_unique", table_name: "mantas", primary_key: id, related_manta_id: id, message: `Manta ID ${id} appears ${count} times.` });
  }

  return {
    domain,
    checked_at,
    summary: {
      manta_rows: mantas.length,
      missing_catalog_links: findings.filter((finding) => finding.check_name === "manta_catalog_fk_present").length,
      missing_sighting_links: findings.filter((finding) => finding.check_name === "manta_sighting_fk_present").length,
      no_photos_expected_exceptions: mantas.filter((manta) => truthy(manta.no_photos_expected)).length,
      no_photos_expected_with_photos: findings.filter((finding) => finding.check_name === "manta_no_photos_expected_matches_photo_links").length,
      no_ventral_photo_exceptions: mantas.filter((manta) => truthy(manta.no_ventral_photos)).length,
      no_ventral_photo_with_ventral_links: findings.filter((finding) => finding.check_name === "manta_no_ventral_photos_matches_ventral_photo_links").length,
      catalog_unknown_exceptions: mantas.filter((manta) => truthy(manta.catalog_unknown)).length,
      catalog_unknown_with_catalog_links: findings.filter((finding) => finding.check_name === "manta_catalog_unknown_matches_catalog_link").length,
    },
    findings,
  };
}
