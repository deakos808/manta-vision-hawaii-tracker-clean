// src/pages/AdminPhotoTestPage.tsx

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Layout from '@/components/layout/Layout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

export default function AdminPhotoTestPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pkPhotoId, setPkPhotoId] = useState<string>('');
  const [existingPath, setExistingPath] = useState<string>('');
  const [existingUrl, setExistingUrl] = useState<string>('');
  const [existingImageError, setExistingImageError] = useState<boolean>(false);
  const [newPreviewUrl, setNewPreviewUrl] = useState<string>('');
  const [status, setStatus] = useState<'new' | 'exists' | 'fixable' | 'invalid' | null>(null);
  const [forceUpdate, setForceUpdate] = useState<boolean>(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setNewPreviewUrl(URL.createObjectURL(file));
    setExistingImageError(false);

    const filename = file.name;
    const base = filename.replace(/\.[^/.]+$/, '');
    if (!/^\d+$/.test(base)) {
      setStatus('invalid');
      toast.error('Filename must be a numeric pk_photo_id');
      return;
    }

    setPkPhotoId(base);
    const { data, error } = await supabase
      .from('photos')
      .select('storage_path')
      .eq('pk_photo_id', base)
      .single();

    if (error || !data) {
      setStatus('new');
      setExistingPath('');
      setExistingUrl('');
    } else {
      const valid = data.storage_path && data.storage_path.startsWith('photos/');
      const url = supabase.storage.from('manta-images').getPublicUrl(data.storage_path).data.publicUrl;
      setExistingPath(data.storage_path);
      setExistingUrl(url);
      setStatus(valid ? 'exists' : 'fixable');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !pkPhotoId) return;
    const filename = selectedFile.name;
    const storagePath = `photos/${pkPhotoId}/${filename}`;

    if (status === 'exists' && !forceUpdate) {
      toast.info('Photo exists and force update is not enabled. Skipping upload.');
      return;
    }

    const { error: uploadError } = await supabase.storage
      .from('manta-images')
      .upload(storagePath, selectedFile, { upsert: true });

    if (uploadError) {
      toast.error(`Upload failed: ${uploadError.message}`);
      return;
    }

    const { error: dbError } = await supabase
      .from('photos')
      .update({
        file_name2: filename,
        storage_path: storagePath,
        uploaded_at: new Date().toISOString(),
      })
      .eq('pk_photo_id', pkPhotoId);

    if (dbError) {
      toast.error(`DB update failed: ${dbError.message}`);
      return;
    }

    toast.success(`Photo ${pkPhotoId} uploaded and storage path updated.`);
    setStatus('exists');
    const url = supabase.storage.from('manta-images').getPublicUrl(storagePath).data.publicUrl;
    setExistingUrl(url);
    setExistingPath(storagePath);
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto py-10 px-4">
        <h1 className="text-2xl font-bold mb-4">Single Photo Upload Test</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Upload a test photo with filename in the format <code>pk_photo_id.jpg</code>
        </p>

        <Input type="file" accept="image/*" onChange={handleFileChange} />

        {status && (
          <div className="mt-6 border rounded-lg p-4">
            <p><strong>Filename:</strong> {selectedFile?.name}</p>
            <p><strong>Photo ID:</strong> {pkPhotoId}</p>
            <p><strong>Status:</strong> {status}</p>
            <p><strong>Storage Path:</strong> {existingPath || '(not set)'}</p>

            {existingUrl && (
              <div className="mt-4">
                <Label className="block mb-1">Existing Image</Label>
                <img
                  src={existingUrl}
                  alt="Existing"
                  className="max-h-64 rounded border"
                  onError={() => setExistingImageError(true)}
                />
                {existingImageError && (
                  <p className="text-red-600 text-sm mt-2">⚠️ Failed to load image — storage path may be broken.</p>
                )}
                <p className="text-xs text-blue-600 mt-1">
                  <a href={existingUrl} target="_blank" rel="noopener noreferrer">Open Public URL</a>
                </p>
              </div>
            )}

            {newPreviewUrl && (
              <div className="mt-4">
                <Label className="block mb-1">Selected Image for Upload</Label>
                <img src={newPreviewUrl} alt="Selected preview" className="max-h-64 rounded border" />
              </div>
            )}

            <div className="flex items-center space-x-2 mt-4">
              <Checkbox id="force-update" checked={forceUpdate} onCheckedChange={() => setForceUpdate(!forceUpdate)} />
              <Label htmlFor="force-update">Force update even if path appears valid</Label>
            </div>

            <Button onClick={handleUpload} className="mt-4">
              Upload and Update Storage Path
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
