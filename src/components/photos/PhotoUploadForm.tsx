// src/components/photos/PhotoUploadForm.tsx

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { v4 as uuidv4 } from 'uuid';
import CatalogMatchModal from '@/components/matching/CatalogMatchModal';
import SearchCatalogModal from '@/components/matching/SearchCatalogModal';

interface PhotoUploadFormProps {
  tempMantaId: string;
  onPhotosChange?: (photos: TempPhotoWithFile[]) => void;
  initialPhotos?: TempPhotoWithFile[];
}

export interface TempPhotoWithFile {
  id: string;
  file: File;
  previewUrl: string;
  photo_type: 'dorsal' | 'ventral';
  is_best_ventral: boolean;
}

export default function PhotoUploadForm({ tempMantaId, onPhotosChange, initialPhotos = [] }: PhotoUploadFormProps) {
  const [photos, setPhotos] = useState<TempPhotoWithFile[]>(initialPhotos);
  const inputRef = useRef<HTMLInputElement>(null);
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [manualModalOpen, setManualModalOpen] = useState(false);

  useEffect(() => {
    if (initialPhotos.length > 0) {
      setPhotos(initialPhotos);
    }
  }, [initialPhotos]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    const remainingSlots = 5 - photos.length;
    const limitedFiles = newFiles.slice(0, remainingSlots);

    const newPhotos = limitedFiles.map((file) => {
      const id = uuidv4();
      return {
        id,
        file,
        previewUrl: URL.createObjectURL(file),
        photo_type: 'ventral',
        is_best_ventral: false,
      };
    });

    const updatedPhotos = [...photos, ...newPhotos];
    setPhotos(updatedPhotos);
    onPhotosChange?.(updatedPhotos);

    if (inputRef.current) inputRef.current.value = '';
  };

  const toggleBest = (id: string) => {
    const updated = photos.map((p) => ({
      ...p,
      is_best_ventral: p.id === id,
    }));
    setPhotos(updated);
    onPhotosChange?.(updated);
  };

  const toggleView = (id: string) => {
    const updated = photos.map((p) =>
      p.id === id ? { ...p, photo_type: p.photo_type === 'ventral' ? 'dorsal' : 'ventral' } : p
    );
    setPhotos(updated);
    onPhotosChange?.(updated);
  };

  const removePhoto = (id: string) => {
    const updated = photos.filter((p) => p.id !== id);
    setPhotos(updated);
    onPhotosChange?.(updated);
  };

  const bestPhoto = photos.find((p) => p.is_best_ventral);

  return (
    <div className="space-y-3">
      <Label>Upload Photos (up to 5)</Label>
      <Input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileChange}
        disabled={photos.length >= 5}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {photos.map((p) => (
          <div key={p.id} className="border p-2 rounded relative">
            <img src={p.previewUrl} alt="Preview" className="w-full h-32 object-cover rounded" />
            <div className="text-xs mt-1 text-center">{p.photo_type}</div>
            <div className="flex justify-between text-xs mt-1">
              <Button size="sm" variant="ghost" onClick={() => toggleView(p.id)}>Flip View</Button>
              <Button size="sm" variant="outline" onClick={() => toggleBest(p.id)}>
                {p.is_best_ventral ? '⭐ Best' : 'Mark Best'}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => removePhoto(p.id)}>🗑️</Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!bestPhoto}
          onClick={() => setMatchModalOpen(true)}
        >
          🔍 Find Match
        </Button>

        <Button
          type="button"
          variant="ghost"
          disabled={!bestPhoto}
          onClick={() => setManualModalOpen(true)}
        >
          🧠 Manual Search
        </Button>
      </div>

      {bestPhoto && (
        <CatalogMatchModal
          open={matchModalOpen}
          onClose={() => setMatchModalOpen(false)}
          photoUrl={bestPhoto.previewUrl}
          tempMantaId={tempMantaId}
        />
      )}

      <SearchCatalogModal
        open={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        tempMantaId={tempMantaId}
      />
    </div>
  );
}
