// src/pages/AdminPhotoStorageCheckPage.tsx

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Layout from '@/components/layout/Layout';
import RequireAuth from '@/components/auth/RequireAuth';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type PhotoRow = {
  pk_photo_id: string;
  storage_path: string;
};

export default function AdminPhotoStorageCheckPage() {
  const [missingFiles, setMissingFiles] = useState<PhotoRow[]>([]);
  const [orphanFiles, setOrphanFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    runStorageCheck();
  }, []);

  const runStorageCheck = async () => {
    setLoading(true);
    toast.info('Checking photo storage consistency...');

    const { data: photoRows, error: photoError } = await supabase
      .from('photos')
      .select('pk_photo_id, storage_path');

    if (photoError || !photoRows) {
      toast.error('Failed to fetch photos table');
      setLoading(false);
      return;
    }

    const { data: fileList, error: storageError } = await supabase.storage
      .from('manta-images')
      .list('photos', { limit: 9999, offset: 0 });

    if (storageError || !fileList) {
      toast.error('Failed to list storage folders');
      setLoading(false);
      return;
    }

    const missing: PhotoRow[] = [];
    const seenPkIds = new Set<string>();

    for (const row of photoRows) {
      const path = row.storage_path;
      if (!path) {
        missing.push(row);
        continue;
      }

      const { data, error } = await supabase.storage
        .from('manta-images')
        .createSignedUrl(path, 1); // test with signed URL

      if (error || !data?.signedUrl) {
        missing.push(row);
      }

      seenPkIds.add(row.pk_photo_id);
    }

    const orphanCandidates: string[] = [];

    for (const folder of fileList) {
      const folderName = folder.name;
      if (!seenPkIds.has(folderName)) {
        orphanCandidates.push(folderName);
      }
    }

    setMissingFiles(missing);
    setOrphanFiles(orphanCandidates);
    toast.success('Storage check complete');
    setLoading(false);
  };

  const downloadCSV = (rows: { pk_photo_id: string; storage_path: string }[], filename: string) => {
    const headers = ['pk_photo_id', 'storage_path'];
    const csv = [headers, ...rows.map(r => [r.pk_photo_id, r.storage_path])].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadOrphans = (rows: string[], filename: string) => {
    const headers = ['orphan_folder'];
    const csv = [headers, ...rows.map(name => [name])].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <RequireAuth adminOnly>
      <Layout>
        <div className="max-w-4xl mx-auto py-10 px-4">
          <h1 className="text-2xl font-bold mb-4">Photo Storage Consistency Check</h1>
          <p className="mb-4 text-muted-foreground text-sm">
            This tool checks that every record in the <code>photos</code> table points to a real image file in the
            <code> manta-images</code> bucket, and that there are no orphaned folders in storage with no matching DB record.
          </p>

          <div className="flex gap-4 mb-6">
            <Button onClick={runStorageCheck} disabled={loading}>
              {loading ? 'Checking...' : 'Re-run Check'}
            </Button>

            {missingFiles.length > 0 && (
              <Button variant="outline" onClick={() => downloadCSV(missingFiles, 'missing_files.csv')}>
                Download Missing File List
              </Button>
            )}

            {orphanFiles.length > 0 && (
              <Button variant="outline" onClick={() => downloadOrphans(orphanFiles, 'orphan_folders.csv')}>
                Download Orphan Folder List
              </Button>
            )}
          </div>

          <div className="mb-6">
            <h2 className="font-semibold mb-2">Missing Files in Storage ({missingFiles.length})</h2>
            <ul className="text-sm text-red-700 list-disc pl-5 space-y-1">
              {missingFiles.map((m, i) => (
                <li key={i}>
                  {m.pk_photo_id} — {m.storage_path}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-semibold mb-2">Orphaned Folders in Storage ({orphanFiles.length})</h2>
            <ul className="text-sm text-orange-700 list-disc pl-5 space-y-1">
              {orphanFiles.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
      </Layout>
    </RequireAuth>
  );
}
