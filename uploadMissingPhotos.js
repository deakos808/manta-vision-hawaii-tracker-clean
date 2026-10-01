// uploadMissingPhotos.js (ES Module)

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const localFolder = path.resolve(__dirname, 'dev/FM Photos Exported');

const supabase = createClient(supabaseUrl, supabaseKey);

// ✅ Fetch all photo IDs and paths from the database
async function fetchAllPhotoIdsWithPaths() {
  let from = 0;
  const step = 1000;
  let allRows = [];
  let done = false;

  while (!done) {
    const { data, error } = await supabase
      .from('photos')
      .select('pk_photo_id, storage_path', { count: 'exact' })
      .range(from, from + step - 1);

    if (error) {
      console.error('❌ Error fetching photo IDs:', error.message);
      process.exit(1);
    }

    allRows = allRows.concat(data);
    if (data.length < step) done = true;
    else from += step;
  }

  return allRows;
}

// ✅ Check if photo file exists in Supabase Storage
async function photoExistsInStorage(pk_photo_id) {
  const folder = `photos/${pk_photo_id}`;
  const { data, error } = await supabase.storage
    .from('manta-images')
    .list(folder);

  if (error) {
    console.error(`⚠️  Error checking storage for ${pk_photo_id}:`, error.message);
    return false;
  }

  return data.some(f => f.name === `${pk_photo_id}.jpg`);
}

// ✅ Upload one missing photo
async function uploadFile(pk_photo_id, filepath) {
  const fileBuffer = fs.readFileSync(filepath);
  const storagePath = `photos/${pk_photo_id}/${pk_photo_id}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('manta-images')
    .upload(storagePath, fileBuffer, {
      upsert: true,
      contentType: 'image/jpeg',
    });

  if (uploadError) {
    console.error(`❌ Upload failed for ${pk_photo_id}:`, uploadError.message);
    return false;
  }

  const { error: updateError } = await supabase
    .from('photos')
    .update({ storage_path: storagePath })
    .eq('pk_photo_id', pk_photo_id);

  if (updateError) {
    console.error(`❌ DB update failed for ${pk_photo_id}:`, updateError.message);
    return false;
  }

  console.log(`✅ Uploaded ${pk_photo_id}`);
  return true;
}

// 🚀 Main
async function main() {
  const dbPhotos = await fetchAllPhotoIdsWithPaths();
  const localFiles = fs.readdirSync(localFolder).filter((f) =>
    /\.(jpg|jpeg|png)$/i.test(f)
  );

  let uploaded = 0;
  let skipped = 0;

  for (const file of localFiles) {
    const base = path.parse(file).name;
    const row = dbPhotos.find((r) => String(r.pk_photo_id) === base);
    if (!row) continue;

    const exists = await photoExistsInStorage(base);
    if (exists) {
      skipped++;
      continue;
    }

    const fullPath = path.join(localFolder, file);
    const success = await uploadFile(base, fullPath);
    if (success) uploaded++;
  }

  console.log(`\n📊 Upload Summary`);
  console.log(`✅ Uploaded: ${uploaded}`);
  console.log(`⏩ Skipped (already in storage): ${skipped}`);
}

main();
