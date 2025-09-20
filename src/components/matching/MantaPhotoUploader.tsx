// File: src/components/forms/MantaPhotoUploader.tsx
import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

export interface UploadedPhoto {
  url: string;
  path: string;
  view: 'ventral' | 'dorsal';
  is_best_ventral: boolean;
}

interface Props {
  mantaId: string;
  onPhotosChange: (photos: UploadedPhoto[]) => void;
}

export default function MantaPhotoUploader({ mantaId, onPhotosChange }: Props) {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ───────────────────────────────
   * Helpers
   * ───────────────────────────────*/
  const pushUpdate = (arr: UploadedPhoto[]) => {
    setPhotos(arr);
    onPhotosChange(arr);
  };

  /* ───────────────────────────────
   * Upload
   * ───────────────────────────────*/
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newUploads: UploadedPhoto[] = [];

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const view: 'ventral' | 'dorsal' = 'ventral'; // default, user can flip later
      const filename = `${mantaId}_${view}_${uuidv4()}.${ext}`;
      const storagePath = `temp-images/${view}/${filename}`;

      const { error } = await supabase.storage
        .from('temp-images')
        .upload(storagePath, file, { upsert: false });

      if (error) {
        console.error('Upload error', error);
        continue;
      }

      const url =
        supabase.storage.from('temp-images').getPublicUrl(storagePath).data
          .publicUrl;

      newUploads.push({
        url,
        path: storagePath,
        view,
        is_best_ventral: false,
      });
    }

    pushUpdate([...photos, ...newUploads]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updatePhoto = (idx: number, upd: Partial<UploadedPhoto>) => {
    const copy = [...photos];
    copy[idx] = { ...copy[idx], ...upd };
    pushUpdate(copy);
  };

  const deletePhoto = (idx: number) => {
    const copy = photos.filter((_, i) => i !== idx);
    pushUpdate(copy);
  };

  /* ───────────────────────────────
   * Render
   * ───────────────────────────────*/
  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
      <Button onClick={() => fileInputRef.current?.click()}>
        Upload Manta Photos
      </Button>

      <div className="flex flex-wrap gap-4">
        {photos.map((p, i) => (
          <div key={p.path} className="relative border rounded p-2">
            <img src={p.url} className="h-32 w-32 object-cover rounded" />
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <Label>View: {p.view}</Label>
                <Switch
                  checked={p.view === 'ventral'}
                  onCheckedChange={(chk) =>
                    updatePhoto(i, { view: chk ? 'ventral' : 'dorsal' })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Best Ventral</Label>
                <Switch
                  checked={p.is_best_ventral}
                  disabled={p.view !== 'ventral'}
                  onCheckedChange={(chk) =>
                    updatePhoto(i, { is_best_ventral: chk })
                  }
                />
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => deletePhoto(i)}
              className="absolute top-0 right-0 text-red-500"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
