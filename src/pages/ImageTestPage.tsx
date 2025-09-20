// src/pages/StorageTestPage.tsx
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { UploadCloud, AlertCircle, CheckCircle2, Tag } from 'lucide-react';
import { tagImageForDeletion } from '@/lib/mantaImageManager';
import Layout from '@/components/layout/Layout';

const StorageTestPage = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageId, setImageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTagged, setIsTagged] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const uploadFile = async () => {
    if (!file) {
      toast.error('Please select a file first');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `test/test-${Date.now()}.${fileExt}`;

      const { data, error: uploadError } = await supabase.storage
        .from('manta-images')
        .upload(filePath, file);

      if (uploadError) {
        setError(`Upload failed: ${uploadError.message}`);
        toast.error('File upload failed');
        return;
      }

      const { data: urlData } = supabase.storage
        .from('manta-images')
        .getPublicUrl(data.path);

      setImageUrl(urlData.publicUrl);

      const { data: imageData, error: dbError } = await supabase
        .from('manta_images')
        .insert({
          manta_id: '00000000-0000-0000-0000-000000000000', // Placeholder
          image_type: 'test',
          image_url: urlData.publicUrl,
          storage_path: data.path,
          thumbnail_url: urlData.publicUrl
        })
        .select()
        .single();

      if (dbError) {
        setError(`Database record creation failed: ${dbError.message}`);
        console.error('Insert failed:', dbError);
      } else {
        setImageId(imageData.id);
        toast.success('Upload + DB record success!');
      }
    } catch (err) {
      setError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleTagForDeletion = async () => {
    if (!imageId) {
      toast.error('No image to tag');
      return;
    }

    const success = await tagImageForDeletion(imageId);
    if (success) {
      setIsTagged(true);
      toast.success('Tagged for secure deletion');
    } else {
      toast.error('Failed to tag for deletion');
    }
  };

  return (
    <Layout>
      <div className="container mx-auto py-8">
        <h1 className="text-2xl font-bold mb-6">[TEST] Storage Bucket Test</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload Test Image</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => document.getElementById('file-upload')?.click()}
                >
                  <UploadCloud className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground mb-1">Click to select an image</p>
                  <Input
                    id="file-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={uploading}
                  />
                </div>

                {file && (
                  <div className="text-sm">
                    Selected file: <span className="font-medium">{file.name}</span> ({Math.round(file.size / 1024)} KB)
                  </div>
                )}

                <Button onClick={uploadFile} disabled={!file || uploading} className="w-full">
                  {uploading ? 'Uploading...' : 'Upload to manta-images bucket'}
                </Button>

                {error && (
                  <div className="bg-red-50 p-3 rounded-md flex items-start gap-2 text-sm text-red-700 border border-red-200">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Error</p>
                      <p>{error}</p>
                      {error.includes('permission') && (
                        <p className="mt-1">This might be caused by missing RLS or a denied insert policy. Please check Supabase policies.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Display Test Results</CardTitle>
            </CardHeader>
            <CardContent>
              {imageUrl ? (
                <div className="space-y-4">
                  <div className="bg-green-50 p-3 rounded-md flex items-start gap-2 text-sm text-green-700 border border-green-200">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                    <p>Image uploaded and retrieved successfully!</p>
                  </div>

                  <div className="border rounded-md overflow-hidden">
                    <img src={imageUrl} alt="Uploaded test" className="w-full h-auto max-h-[300px] object-contain" />
                  </div>

                  <p className="text-xs text-muted-foreground break-all">
                    <span className="font-medium">URL:</span> {imageUrl}
                  </p>

                  {imageId && (
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1"
                        onClick={handleTagForDeletion}
                        disabled={isTagged}
                      >
                        <Tag className="h-4 w-4" />
                        Tag for Deletion
                      </Button>
                    </div>
                  )}

                  {isTagged && (
                    <div className="bg-amber-50 p-3 rounded-md text-sm text-amber-700 border border-amber-200">
                      This image is marked for secure deletion and can now be removed by an admin.
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                  <p>Upload an image to see results</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default StorageTestPage;