import fs from "fs";
import path from "path";
import {
  QcContext,
  DomainResult,
  Finding,
  addNoDatabaseFinding,
  hasTable,
  indexBy,
  loadRows,
} from "./qc_common";

type ManifestRow = {
  manifest_path: string;
  row_number: number;
  output_filename: string;
  photo_id?: string;
  pk_photo_id?: string;
  catalog_id?: string;
  pk_catalog_id?: string;
  fk_catalog_id?: string;
  storage_path?: string;
  [key: string]: string | undefined | number;
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function readManifest(manifestPath: string): ManifestRow[] {
  const text = fs.readFileSync(manifestPath, "utf8").trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row: ManifestRow = {
      manifest_path: manifestPath,
      row_number: index + 2,
      output_filename: "",
    };
    headers.forEach((header, ix) => {
      row[header] = values[ix] ?? "";
    });
    return row;
  });
}

function findManifestPaths(repoRoot: string) {
  const exportRoot = path.join(repoRoot, "export");
  const found: string[] = [];
  if (!fs.existsSync(exportRoot)) return found;

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(entryPath);
      else if (entry.isFile() && entry.name.toLowerCase() === "manifest.csv") found.push(entryPath);
    }
  };
  walk(exportRoot);
  return found.sort();
}

function photoIdFromRow(row: ManifestRow) {
  return String(row.photo_id ?? row.pk_photo_id ?? "").trim();
}

function catalogIdFromRow(row: ManifestRow) {
  return String(row.catalog_id ?? row.pk_catalog_id ?? row.fk_catalog_id ?? "").trim();
}

async function storageObjectExists(ctx: QcContext, storagePath: string) {
  if (!ctx.supabase || !ctx.checkStorage || !storagePath) return null;
  const { data, error } = await ctx.supabase.storage.from("manta-images").createSignedUrl(storagePath, 30);
  return !error && Boolean(data?.signedUrl);
}

export async function checkPhotoStorageExports(ctx: QcContext): Promise<DomainResult> {
  const domain = "photo-storage";
  const checked_at = new Date().toISOString();
  const findings: Finding[] = [];

  const manifestPaths = findManifestPaths(ctx.repoRoot);
  const manifestRows = manifestPaths.flatMap(readManifest);
  const photos = ctx.supabase && hasTable(ctx, "photos") ? await loadRows(ctx, "photos") : [];
  const photosById = indexBy(photos, "pk_photo_id");
  const manifestRowsByPhoto = new Map<string, ManifestRow[]>();

  if (!ctx.supabase) findings.push(addNoDatabaseFinding(domain));

  for (const manifestPath of manifestPaths) {
    const rows = manifestRows.filter((row) => row.manifest_path === manifestPath);
    const dir = path.dirname(manifestPath);
    const manifestNames = new Set(rows.map((row) => String(row.output_filename ?? "")));
    const imageFiles = fs
      .readdirSync(dir)
      .filter((name) => /\.(jpe?g|png|webp)$/i.test(name));

    for (const imageFile of imageFiles) {
      if (!manifestNames.has(imageFile)) {
        findings.push({
          domain,
          severity: "info",
          check_name: "local_export_file_listed_in_manifest",
          message: `Local export file '${path.relative(ctx.repoRoot, path.join(dir, imageFile))}' is not listed in its manifest.`,
          suggested_action: "Confirm whether this is an intentional extra export artifact.",
          metadata: { file: path.join(dir, imageFile), manifest_path: manifestPath },
        });
      }
    }
  }

  for (const row of manifestRows) {
    const dir = path.dirname(row.manifest_path);
    const outputFilename = String(row.output_filename ?? "");
    const expectedPath = path.join(dir, outputFilename);
    const photoId = photoIdFromRow(row);
    const catalogId = catalogIdFromRow(row);
    if (photoId) {
      if (!manifestRowsByPhoto.has(photoId)) manifestRowsByPhoto.set(photoId, []);
      manifestRowsByPhoto.get(photoId)!.push(row);
    }

    if (!outputFilename || !fs.existsSync(expectedPath)) {
      findings.push({
        domain,
        severity: "error",
        check_name: "manifest_file_exists",
        related_photo_id: photoId || null,
        related_catalog_id: catalogId || null,
        message: `Manifest '${path.relative(ctx.repoRoot, row.manifest_path)}' row ${row.row_number} references missing file '${outputFilename}'.`,
        suggested_action: "Re-export or update the manifest after confirming the correct local filename.",
        metadata: { expected_path: expectedPath },
      });
    } else {
      const stat = fs.statSync(expectedPath);
      if (stat.size <= 0) {
        findings.push({
          domain,
          severity: "error",
          check_name: "exported_image_nonempty",
          related_photo_id: photoId || null,
          related_catalog_id: catalogId || null,
          message: `Exported image '${path.relative(ctx.repoRoot, expectedPath)}' is empty.`,
          suggested_action: "Re-export the image from Supabase Storage.",
        });
      }
    }

    if (photoId && photosById.size > 0) {
      const dbPhoto = photosById.get(photoId);
      if (!dbPhoto) {
        findings.push({
          domain,
          severity: "error",
          check_name: "manifest_photo_id_exists_in_database",
          related_photo_id: photoId,
          related_catalog_id: catalogId || null,
          message: `Manifest photo ID ${photoId} does not match any loaded photos row.`,
          suggested_action: "Inspect whether the manifest is stale or the photo row is missing.",
        });
      } else {
        const dbCatalogId = dbPhoto.fk_catalog_id == null ? "" : String(dbPhoto.fk_catalog_id);
        const dbStoragePath = dbPhoto.storage_path == null ? "" : String(dbPhoto.storage_path);
        if (catalogId && dbCatalogId && catalogId !== dbCatalogId) {
          findings.push({
            domain,
            severity: "error",
            check_name: "manifest_catalog_id_matches_photo_row",
            related_photo_id: photoId,
            related_catalog_id: catalogId,
            message: `Manifest photo ${photoId} says catalog ${catalogId}, but database photo row says catalog ${dbCatalogId}.`,
            suggested_action: "Review the photo/catalog relationship before using this export as a matcher anchor.",
          });
        }
        if (row.storage_path && dbStoragePath && row.storage_path !== dbStoragePath) {
          findings.push({
            domain,
            severity: "warning",
            check_name: "manifest_storage_path_matches_photo_row",
            related_photo_id: photoId,
            related_catalog_id: catalogId || dbCatalogId || null,
            message: `Manifest photo ${photoId} storage_path '${row.storage_path}' differs from database '${dbStoragePath}'.`,
            suggested_action: "Confirm whether the manifest was generated before a storage-path migration.",
          });
        }
      }
    }

    if (row.storage_path && ctx.checkStorage) {
      const exists = await storageObjectExists(ctx, String(row.storage_path));
      if (exists === false) {
        findings.push({
          domain,
          severity: "error",
          check_name: "manifest_storage_object_exists",
          related_photo_id: photoId || null,
          related_catalog_id: catalogId || null,
          message: `Supabase Storage object '${row.storage_path}' was not signable from bucket manta-images.`,
          suggested_action: "Verify bucket/path metadata and storage object presence.",
        });
      }
    }
  }

  for (const [photoId, rows] of manifestRowsByPhoto.entries()) {
    const filenames = Array.from(new Set(rows.map((row) => row.output_filename)));
    const manifestNames = Array.from(new Set(rows.map((row) => path.relative(ctx.repoRoot, row.manifest_path))));
    if (filenames.length > 1) {
      findings.push({
        domain,
        severity: "info",
        check_name: "same_photo_exported_multiple_filenames",
        related_photo_id: photoId,
        message: `Photo ${photoId} appears in exports under ${filenames.length} local filenames.`,
        suggested_action: "Informational only: confirm each export's naming convention is intentional.",
        metadata: { filenames, manifests: manifestNames },
      });
    }
  }

  const known6128 = manifestRowsByPhoto.get("6128") ?? [];
  const known6128Missing = known6128.filter((row) => !fs.existsSync(path.join(path.dirname(row.manifest_path), String(row.output_filename))));
  if (known6128.length > 0) {
    findings.push({
      domain,
      severity: known6128Missing.length > 0 ? "warning" : "info",
      check_name: "known_photo_6128_export_mismatch_probe",
      related_photo_id: 6128,
      related_catalog_id: 1,
      message:
        known6128Missing.length > 0
          ? `Known probe photo 6128 is present in manifests and has ${known6128Missing.length} missing expected local file reference.`
          : "Known probe photo 6128 was found in manifests and all referenced local files exist.",
      suggested_action: "Use this as a regression check for the original matcher/export mismatch.",
      metadata: {
        rows: known6128.map((row) => ({
          manifest: path.relative(ctx.repoRoot, row.manifest_path),
          output_filename: row.output_filename,
          exists: fs.existsSync(path.join(path.dirname(row.manifest_path), String(row.output_filename))),
        })),
      },
    });
  }

  return {
    domain,
    checked_at,
    summary: {
      manifests_checked: manifestPaths.length,
      manifest_rows: manifestRows.length,
      database_photos_loaded: photos.length,
      storage_checks_enabled: ctx.checkStorage,
    },
    findings,
  };
}
