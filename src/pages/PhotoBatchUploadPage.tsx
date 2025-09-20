// src/pages/PhotoBatchUploadPage.tsx

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface ParsedPhoto {
  pk_photo_id: string;
  original_filename: string;
  storage_path: string;
  file: File;
  valid: boolean;
  status?: 'uploaded' | 'failed' | 'invalid';
  error?: string;
}

export default function PhotoBatchUploadPage() {
  const [parsedPhotos, setParsedPhotos] = useState<ParsedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const fileArray = Array.from(files);
    const results: ParsedPhoto[] = [];

    for (const file of fileArray) {
      const filename = file.name;
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const base = filename.replace(/\.[^/.]+$/, '');
      const isValid = /^\d+$/.test(base) && ['jpg', 'jpeg', 'png', 'heic'].includes(ext);

      if (!isValid) {
        results.push({
          pk_photo_id: '',
          original_filename: filename,
          storage_path: '',
          file,
          valid: false,
          status: 'invalid',
          error: 'Invalid filename or extension'
        });
        continue;
      }

      const pk_photo_id = base;
      const storage_path = `photos/${pk_photo_id}/${filename}`;

      results.push({
        pk_photo_id,
        original_filename: filename,
        storage_path,
        file,
        valid: true
      });
    }

    setParsedPhotos(results);
  };

  const handleUpload = async () => {
    setUploading(true);
    let successCount = 0;
    let failedCount = 0;
    const updated: ParsedPhoto[] = [];

    for (const photo of parsedPhotos) {
      const { file, pk_photo_id, original_filename, storage_path, valid } = photo;

      if (!valid) {
        updated.push({ ...photo, status: 'invalid' });
        failedCount++;
        continue;
      }

      const { error: uploadError } = await supabase.storage
        .from('manta-images')
        .upload(storage_path, file, { upsert: true });

      if (uploadError) {
        updated.push({
          ...photo,
          status: 'failed',
          error: uploadError.message
        });
        failedCount++;
        continue;
      }

      const { error: dbError } = await supabase
        .from('photos')
        .upsert({
          pk_photo_id,
          file_name2: original_filename,
          storage_path,
          uploaded_at: new Date().toISOString()
        }, { onConflict: 'pk_photo_id' });

      if (dbError) {
        updated.push({
          ...photo,
          status: 'failed',
          error: dbError.message
        });
        failedCount++;
        continue;
      }

      updated.push({ ...photo, status: 'uploaded' });
      successCount++;
    }

    setParsedPhotos(updated);
    setUploading(false);

    alert(
      `✅ Upload Complete\n\n` +
      `Uploaded: ${successCount}\n` +
      `Failed: ${failedCount}\n` +
      `Invalid: ${updated.filter(p => p.status === 'invalid').length}`
    );
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-10 px-4">
        <h1 className="text-2xl font-bold mb-4">Batch Upload Manta Photos</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Upload images from a folder. Filenames must be numeric (e.g. 1234.jpg) and use .jpg, .jpeg, .png, or .heic
        </p>

        <div className="mb-4">
          <label className="font-medium flex items-center gap-2">
            Select Folder:
            <Input
              type="file"
              webkitdirectory="true"
              directory="true"
              multiple
              onChange={handleFolderSelect}
              disabled={uploading}
              accept=".jpg,.jpeg,.png,.heic"
            />
          </label>
        </div>

        {parsedPhotos.length > 0 && (
          <div className="mb-6">
            <h2 className="font-semibold mb-2">Upload Preview ({parsedPhotos.length} files)</h2>
            <ul className="space-y-1 text-sm max-h-[300px] overflow-y-scroll pr-2">
              {parsedPhotos.map((p, idx) => (
                <li
                  key={idx}
                  className={
                    p.status === 'uploaded'
                      ? 'text-green-700'
                      : p.status === 'failed'
                      ? 'text-red-700'
                      : p.status === 'invalid'
                      ? 'text-red-600'
                      : 'text-gray-700'
                  }
                >
                  {p.pk_photo_id || '[INVALID]'}: {p.original_filename}
                  {p.error && ` — ${p.error}`}
                  {p.status && ` — ${p.status}`}
                </li>
              ))}
            </ul>

            <div className="mt-4">
              <Button onClick={handleUpload} disabled={uploading}>
                {uploading ? 'Uploading...' : 'Proceed with Import'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
