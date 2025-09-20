// src/pages/admin/ChooseBestMantaPhotoPage.tsx

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

interface Photo {
  pk_photo_id: number;
  photo_url: string;
  thumbnail_url: string;
  photo_type: 'ventral' | 'dorsal' | null;
  is_best_sighting_photo: boolean;
  is_best_catalog_photo: boolean;
}

export default function ChooseBestMantaPhotoPage() {
  const { id } = useParams();
  const mantaId = parseInt(id || '0');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .eq('fk_manta_id', mantaId);
      if (error) {
        console.error('[Fetch Error]', error.message);
        toast({ title: 'Error loading photos', description: error.message });
      } else {
        setPhotos(data);
      }
      setLoading(false);
    };
    fetch();
  }, [mantaId]);

  const updatePhoto = async (photoId: number, updates: Partial<Photo>) => {
    const { error } = await supabase
      .from('photos')
      .update(updates)
      .eq('pk_photo_id', photoId);
    if (error) {
      toast({ title: 'Error updating photo', description: error.message });
    } else {
      setPhotos((prev) =>
        prev.map((p) =>
          p.pk_photo_id === photoId ? { ...p, ...updates } : p
        )
      );
    }
  };

  const markBestSightingPhoto = async (photoId: number) => {
    const reset = await supabase
      .from('photos')
      .update({ is_best_sighting_photo: false })
      .eq('fk_manta_id', mantaId);

    if (reset.error) return toast({ title: 'Reset error', description: reset.error.message });

    await updatePhoto(photoId, { is_best_sighting_photo: true });
  };

  const markBestCatalogPhoto = async (photoId: number) => {
    const reset = await supabase
      .from('photos')
      .update({ is_best_catalog_photo: false })
      .eq('fk_manta_id', mantaId);

    if (reset.error) return toast({ title: 'Reset error', description: reset.error.message });

    await updatePhoto(photoId, { is_best_catalog_photo: true });
  };

  const toggleType = async (photoId: number, current: string | null) => {
    const next = current === 'ventral' ? 'dorsal' : 'ventral';
    await updatePhoto(photoId, { photo_type: next });
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Choose Best Photo for Manta {mantaId}</h1>
        {loading ? (
          <p>Loading photos...</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {photos.map((photo) => (
              <Card key={photo.pk_photo_id}>
                <CardContent className="p-4 space-y-2">
                  <img
                    src={photo.thumbnail_url || photo.photo_url}
                    alt="manta preview"
                    className="rounded shadow border"
                  />
                  <div className="text-sm">
                    ID: {photo.pk_photo_id}
                    <br />
                    Type: <Badge>{photo.photo_type || 'unknown'}</Badge>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" onClick={() => toggleType(photo.pk_photo_id, photo.photo_type)}>
                      Toggle Type
                    </Button>
                    <Button
                      variant={photo.is_best_sighting_photo ? 'default' : 'outline'}
                      onClick={() => markBestSightingPhoto(photo.pk_photo_id)}
                    >
                      🧩 Best Sighting
                    </Button>
                    <Button
                      variant={photo.is_best_catalog_photo ? 'default' : 'outline'}
                      onClick={() => markBestCatalogPhoto(photo.pk_photo_id)}
                    >
                      📘 Best Catalog
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
