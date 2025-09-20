import { useState, useCallback, useRef } from 'react';
import { UploadCloud } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import RequireAuth from '@/components/auth/RequireAuth';
import DryRunPreviewTable from '@/components/importTools/DryRunPreviewTable';
import Layout from '@/components/layout/Layout';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

type ParsedImage = {
  id: string;
  file: File;
  filename: string;
  metadata: {
    catalogId?: string;
    sightingId?: string;
    date?: string;
    island?: string;
    location?: string;
    latitude?: number;
    longitude?: number;
    ageClass?: string;
    gender?: string;
    size?: string;
    tag?: string;
  };
  errors?: string[];
};

const ImportPage = () => {
  const [files, setFiles] = useState<ParsedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map((file) => {
      const filename = file.name.replace(/\.[^/.]+$/, '');
      const parts = filename.split('_');

      const [
        catalogId,
        island,
        location,
        ageClass,
        gender,
        sightingIdRaw,
        dateRaw,
        tag
      ] = parts;

      const errors: string[] = [];

      if (!catalogId) errors.push('Missing catalog ID');
      if (!island) errors.push('Missing island');
      if (!location) errors.push('Missing location');
      if (!ageClass) errors.push('Missing age class');
      if (!gender || !['Male', 'Female'].includes(gender)) errors.push('Invalid gender');
      if (!dateRaw || !/^\d{1,2}[A-Z]{3}\d{4}$/.test(dateRaw)) errors.push('Invalid date format');

      let parsedDate: string | undefined;
      try {
        const match = dateRaw.match(/^(\d{1,2})([A-Z]{3})(\d{4})$/);
        if (match) {
          const [_, day, mon, year] = match;
          const monthMap: Record<string, string> = {
            JAN: '01', FEB: '02', MAR: '03', APR: '04',
            MAY: '05', JUN: '06', JUL: '07', AUG: '08',
            SEP: '09', OCT: '10', NOV: '11', DEC: '12'
          };
          const month = monthMap[mon];
          if (month) parsedDate = `${year}-${month}-${day.padStart(2, '0')}`;
        }
      } catch {
        errors.push('Date parsing failed');
      }

      return {
        id: crypto.randomUUID(),
        file,
        filename: file.name,
        metadata: {
          catalogId,
          island,
          location,
          latitude: undefined,
          longitude: undefined,
          ageClass: ageClass?.toLowerCase(),
          gender: gender?.toLowerCase(),
          date: parsedDate,
          sightingId: sightingIdRaw?.replace('remote:', ''),
          tag
        },
        errors
      };
    });

    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleDrop(Array.from(e.target.files));
    }
  };

  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) {
      handleDrop(Array.from(e.dataTransfer.files));
    }
  };

  const handleBrowseClick = () => fileInputRef.current?.click();

  const uploadFiles = async () => {
    if (files.length === 0) return toast.error('No files to upload');
    setUploading(true);

    let successCount = 0;

    for (const entry of files) {
      const { file, metadata } = entry;

      const filePath = `${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('manta-images')
        .upload(filePath, file);

      if (uploadError) {
        toast.error(`Failed to upload ${file.name}`);
        console.error(uploadError);
        continue;
      }

      const { publicUrl } = supabase.storage
        .from('manta-images')
        .getPublicUrl(filePath).data;

      const { error: insertError } = await supabase
        .from('sightings')
        .insert({
          manta_id: '00000000-0000-0000-0000-000000000000',
          photo_url: publicUrl,
          island: metadata.island ?? null,
          location: metadata.location ?? null,
          latitude: metadata.latitude ?? null,
          longitude: metadata.longitude ?? null,
          sighting_date: metadata.date ?? null,
          gender: metadata.gender ?? null,
          age_class: metadata.ageClass ?? null,
          size: metadata.size ? Number(metadata.size) : null,
          tag: metadata.tag ?? null
        });

      if (insertError) {
        toast.error(`Failed to save sighting for ${file.name}`);
        console.error(insertError);
        continue;
      }

      successCount++;
    }

    setUploading(false);
    toast.success(`Successfully uploaded ${successCount} of ${files.length} files`);
  };

  return (
    <RequireAuth>
      <Layout>
        <div className="p-6">
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Import Manta Ray Images</h1>
              <p className="text-muted-foreground">Upload photos to preview and add to the sightings database</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setFiles([])} disabled={uploading}>Clear All</Button>
              <Button onClick={uploadFiles} disabled={uploading || files.length === 0}>
                {uploading ? 'Uploading...' : 'Upload Images'}
              </Button>
            </div>
          </div>

          <div
            className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:bg-muted/50 transition-colors"
            onDragOver={onDragOver}
            onDrop={onDrop}
            onClick={handleBrowseClick}
          >
            <UploadCloud className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground mb-1">Drag and drop images here or click to browse</p>
            <p className="text-xs text-muted-foreground">Supports: JPG, PNG, HEIC</p>
            <Input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {files.length > 0 && (
            <div className="mt-8">
              <DryRunPreviewTable
                data={files}
                onEdit={(id) => console.log('Edit:', id)}
                onApproveAll={() => toast.success('All approved')}
              />
            </div>
          )}
        </div>
      </Layout>
    </RequireAuth>
  );
};

export default ImportPage;
