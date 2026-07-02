// Export Best Manta Ventral photos to local files for deterministic matcher evaluation.
//
// Usage:
//   npx tsx scripts/export-best-manta-ventral-photos.ts --out ./export/best_manta_ventral_photos --dry-run=true --limit=25
//   npx tsx scripts/export-best-manta-ventral-photos.ts --out ./export/best_manta_ventral_photos --dry-run=false --limit=25

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

function getFlag(name: string, def?: string): string | undefined {
  const ix = process.argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (ix === -1) return def;
  const arg = process.argv[ix];
  if (arg.includes("=")) return arg.split("=")[1];
  const next = process.argv[ix + 1];
  if (!next || next.startsWith("--")) return def;
  return next;
}

const OUTPUT_DIR = getFlag("out", "./export/best_manta_ventral_photos")!;
const DRY_RUN = (getFlag("dry-run", "true")! || "true").toLowerCase() === "true";
const LIMIT = Number(getFlag("limit", "0") || "0");
const BUCKET = "manta-images";

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or fallback) in env.");
  process.exit(1);
}

const supabase = createClient(URL, KEY);

const sanitize = (s: unknown) =>
  String(s ?? "unknown")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-");

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function extFromPath(storagePath?: string | null): string {
  if (!storagePath) return ".jpg";
  const base = storagePath.split("?")[0];
  const dot = base.lastIndexOf(".");
  return dot === -1 ? ".jpg" : base.slice(dot).toLowerCase();
}

function uniquePath(baseDir: string, filenameNoExt: string, ext: string): string {
  let candidate = path.join(baseDir, `${filenameNoExt}${ext}`);
  let i = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(baseDir, `${filenameNoExt}-${i}${ext}`);
    i++;
  }
  return candidate;
}

async function loadBestMantaRows() {
  let query = supabase
    .from("photos")
    .select(
      "pk_photo_id,pk_photo_uuid,fk_catalog_id,fk_manta_id,fk_sighting_id,storage_path,photo_view,is_best_manta_ventral_photo,is_best_catalog_ventral_photo,population",
    )
    .eq("photo_view", "ventral")
    .eq("is_best_manta_ventral_photo", true)
    .not("storage_path", "is", null)
    .order("fk_catalog_id", { ascending: true })
    .order("pk_photo_id", { ascending: true });

  if (LIMIT > 0) query = query.limit(LIMIT);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function main() {
  console.log("Querying best manta ventral photos...");
  const rows = await loadBestMantaRows();
  console.log(`Found ${rows.length} best manta ventral photos.`);

  ensureDir(OUTPUT_DIR);
  const manifestPath = path.join(OUTPUT_DIR, "manifest.csv");
  const manifest = [
    [
      "output_filename",
      "catalog_id",
      "photo_id",
      "pk_manta_id",
      "fk_sighting_id",
      "storage_path",
      "photo_uuid",
      "is_best_catalog_ventral_photo",
    ].join(","),
  ];

  let success = 0;
  let planned = 0;
  let failed = 0;

  for (const row of rows as any[]) {
    try {
      const catalogId = row.fk_catalog_id;
      const photoId = row.pk_photo_id;
      if (catalogId == null || photoId == null) {
        console.warn(`Skipping photo without catalog/photo id: ${JSON.stringify(row)}`);
        continue;
      }

      const ext = extFromPath(row.storage_path);
      const baseName = `${sanitize(catalogId)}_manta-${sanitize(row.fk_manta_id)}_photo-${sanitize(photoId)}`;
      const outPath = uniquePath(OUTPUT_DIR, baseName, ext);
      const outFile = path.basename(outPath);

      manifest.push(
        [
          outFile,
          sanitize(catalogId),
          sanitize(photoId),
          sanitize(row.fk_manta_id),
          sanitize(row.fk_sighting_id),
          sanitize(row.storage_path),
          sanitize(row.pk_photo_uuid),
          sanitize(row.is_best_catalog_ventral_photo),
        ].join(","),
      );

      if (DRY_RUN) {
        planned++;
        console.log(`dry: ${outFile}`);
        continue;
      }

      const { data: signed, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, 60 * 10);
      if (signErr || !signed?.signedUrl) {
        throw new Error(`Failed to sign URL for ${row.storage_path}: ${signErr?.message}`);
      }

      const res = await fetch(signed.signedUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${row.storage_path}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(outPath, buf);
      success++;
      console.log(`saved: ${outFile}`);
    } catch (error: any) {
      failed++;
      console.error(`failed storage_path=${row?.storage_path}: ${error?.message || error}`);
    }
  }

  fs.writeFileSync(manifestPath, manifest.join("\n"));
  console.log(`Wrote manifest: ${manifestPath}`);
  console.log(`Summary: success=${success} dry/planned=${planned} failed=${failed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
