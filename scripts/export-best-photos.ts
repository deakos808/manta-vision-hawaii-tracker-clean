// scripts/export-best-photos.ts — overwrite (add metadata from view)
// -------------------------------------------------------------
// Export BEST CATALOG VENTRAL photos to a local folder with
// filenames embedding metadata as:
//   <pk_catalog_id>_<gender>_<ageClass>_<population>.<ext>
//
// • Pulls photos from public.photos (ventral & best_catalog)
// • Enriches metadata by looking up each catalog in
//   public.catalog_with_photo_view (gender, age_class, populations, sitelocation)
// • If the view/columns are not available, falls back to "unknown" safely
// • Bucket hard-coded to "manta-images"
// • Includes preflight that prints URL, key length, and decoded key ref
//
// Usage:
//   npx tsx scripts/export-best-photos.ts --out ./export/best_catalog_photos --dry-run=true
//   npx tsx scripts/export-best-photos.ts --out ./export/best_catalog_photos --dry-run=false
// -------------------------------------------------------------

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

function getFlag(name: string, def?: string): string | undefined {
  const ix = process.argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (ix === -1) return def;
  const arg = process.argv[ix];
  if (arg.includes('=')) return arg.split('=')[1];
  const next = process.argv[ix + 1];
  if (!next || next.startsWith('--')) return def;
  return next;
}

const OUTPUT_DIR = getFlag('out', './export/best_catalog_photos')!;
const DRY_RUN = (getFlag('dry-run', 'true')! || 'true').toLowerCase() === 'true';
const BUCKET = 'manta-images';

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  console.error('❌ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or fallback) in env.');
  process.exit(1);
}

const supabase = createClient(URL, KEY);

const sanitize = (s: unknown) => String(s ?? 'unknown')
  .trim()
  .replace(/\s+/g, '-')
  .replace(/[^a-zA-Z0-9._-]/g, '-');

function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }

function extFromPath(storagePath?: string | null): string | undefined {
  if (!storagePath) return undefined;
  const base = storagePath.split('?')[0];
  const dot = base.lastIndexOf('.');
  if (dot === -1) return undefined;
  return base.slice(dot).toLowerCase();
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

function decodeJwtRef(token: string | undefined | null): string | null {
  try {
    if (!token) return null;
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
    const obj = JSON.parse(json);
    return obj?.ref || null;
  } catch (_) {
    return null;
  }
}

function urlProjectRef(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

async function loadPhotos() {
  const { data, error } = await supabase
    .from('photos')
    .select(`
      pk_photo_id,
      pk_photo_uuid,
      fk_catalog_id,
      storage_path,
      photo_view,
      is_best_catalog_ventral_photo,
      population
    `)
    .eq('photo_view', 'ventral')
    .eq('is_best_catalog_ventral_photo', true)
    .not('storage_path', 'is', null);
  if (error) throw error;
  return (data || []) as any[];
}

async function loadCatalogMeta(ids: number[]): Promise<Map<number, any>> {
  const metaMap = new Map<number, any>();
  if (!ids.length) return metaMap;

  // Try to pull gender/age/populations from the view used by your UI.
  try {
    const { data, error } = await supabase
      .from('catalog_with_photo_view')
      .select('pk_catalog_id, gender, age_class, populations, sitelocation')
      .in('pk_catalog_id', ids);

    if (error) throw error;
    for (const row of data || []) {
      metaMap.set(row.pk_catalog_id, row);
    }
  } catch (err: any) {
    console.warn('⚠️  Could not load catalog_with_photo_view metadata:', err?.message || err);
  }

  return metaMap;
}

async function main() {
  console.log('🔎 Querying best catalog ventral photos...');
  const keyLen = (KEY || '').length;
  const keyRef = decodeJwtRef(KEY);
  const urlRef = urlProjectRef(URL);
  console.log('   → URL:', URL);
  console.log('   → Key length:', keyLen);
  if (keyRef) console.log('   → Key ref:', keyRef);
  if (urlRef && keyRef && keyRef !== urlRef) {
    console.warn(`⚠️  Key project ref (${keyRef}) does not match URL ref (${urlRef}).`);
  }

  const photos = await loadPhotos();
  console.log(`📸 Found ${photos.length} photos to export.`);

  const catIds = Array.from(new Set(photos.map((p: any) => p.fk_catalog_id).filter((v: any) => v != null)));
  const metaMap = await loadCatalogMeta(catIds);

  ensureDir(OUTPUT_DIR);
  const manifestPath = path.join(OUTPUT_DIR, 'manifest.csv');
  const manifest = [
    [
      'output_filename',
      'pk_catalog_id',
      'gender',
      'age_class',
      'population',
      'storage_path',
      'photo_uuid',
      'fk_catalog_id',
      'pk_photo_id'
    ].join(',')
  ];

  let success = 0;
  let planned = 0;
  let failed = 0;

  for (const p of photos as any[]) {
    try {
      const pkCatalogId = p.fk_catalog_id; // lead identifier in filename
      const meta = metaMap.get(pkCatalogId) || {};

      const gender = sanitize(meta.gender ?? 'unknown');
      const ageClass = sanitize(meta.age_class ?? 'unknown');

      // Choose population: first from populations[], else sitelocation, else photos.population, else unknown
      let populationRaw: string | undefined = undefined;
      if (Array.isArray(meta.populations) && meta.populations.length > 0) populationRaw = meta.populations[0];
      else if (meta.sitelocation) populationRaw = meta.sitelocation;
      else if (p.population) populationRaw = p.population;
      const population = sanitize(populationRaw ?? 'unknown');

      const baseNameNoExt = `${sanitize(pkCatalogId)}_${gender}_${ageClass}_${population}`;

      const ext = extFromPath(p.storage_path) || '.jpg';
      const outPath = uniquePath(OUTPUT_DIR, baseNameNoExt, ext);
      const outFile = path.basename(outPath);

      manifest.push([
        outFile,
        sanitize(pkCatalogId),
        gender,
        ageClass,
        population,
        sanitize(p.storage_path),
        sanitize(p.pk_photo_uuid),
        sanitize(p.fk_catalog_id),
        sanitize(p.pk_photo_id)
      ].join(','));

      if (DRY_RUN) {
        console.log(`📝 (dry) Would save → ${outFile}`);
        planned++;
        continue;
      }

      const { data: signed, error: signErr } = await supabase
        .storage
        .from(BUCKET)
        .createSignedUrl(p.storage_path, 60 * 10);

      if (signErr || !signed?.signedUrl) {
        throw new Error(`Failed to sign URL for ${p.storage_path}: ${signErr?.message}`);
      }

      const res = await fetch(signed.signedUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${p.storage_path}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(outPath, buf);
      console.log(`✅ Saved ${outFile}`);
      success++;
    } catch (e: any) {
      console.error(`❌ Failed for storage_path=${p?.storage_path}:`, e?.message || e);
      failed++;
    }
  }

  fs.writeFileSync(manifestPath, manifest.join('\n'));
  console.log('🧾 Wrote manifest:', manifestPath);
  console.log(`\nSummary → ✅ ${success}  📝(dry/planned) ${planned}  ❌ ${failed}`);

  if (DRY_RUN) {
    console.log('ℹ️  Dry run complete. Re-run with --dry-run=false to download files.');
  }
}

main().catch((err) => {
  console.error('💥 Unhandled error:', err);
  process.exit(1);
});
