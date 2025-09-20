// src/pages/admin/MissingSightingPhotosPage.tsx

import { useEffect, useState } from 'react';
import Layout from '@/components/layout/Layout';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Photo {
  pk_photo_id: string;
  storage_path: string;
  photo_type: string | null;
  is_best_manta_ventral_photo: boolean;
  fk_sighting_id?: string;
  fk_catalog_id?: string;
  fk_manta_id?: string;
  catalog_name?: string;
}

const BATCH_SIZE = 100;

export default function MissingSightingPhotosPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const [filterViews, setFilterViews] = useState<{ [key in 'ventral' | 'dorsal' | 'unknown']: boolean }>({
    ventral: false,
    dorsal: false,
    unknown: false,
  });
  const [catalogIdFilter, setCatalogIdFilter] = useState('');
  const [mantaIdFilter, setMantaIdFilter] = useState('');
  const [sortBy, setSortBy] = useState<'none' | 'catalog' | 'manta'>('none');
  const [viewCounts, setViewCounts] = useState({ ventral: 0, dorsal: 0, unknown: 0 });

  useEffect(() => {
    const fetchPhotos = async () => {
      setLoading(true);
      const from = (page - 1) * BATCH_SIZE;
      const to = from + BATCH_SIZE - 1;

      const { data, error } = await supabase
        .from('manta-images')
        .select('*')
        .is('fk_sighting_id', null)
        .order('pk_photo_id', { ascending: true })
        .range(from, to);

      if (error) {
        console.error('Error fetching photos:', error);
      } else {
        const cleaned = data.map((photo) => {
          const rawType = photo.photo_type?.toLowerCase();
          const view: 'ventral' | 'dorsal' | 'unknown' =
            rawType === 'ventral' ? 'ventral' : rawType === 'dorsal' ? 'dorsal' : 'unknown';
          return { ...photo, photo_type: view };
        });

        setPhotos((prev) => [...prev, ...cleaned]);
        setHasMore(data.length === BATCH_SIZE);

        const counts = { ventral: 0, dorsal: 0, unknown: 0 };
        cleaned.forEach((p) => counts[p.photo_type as 'ventral' | 'dorsal' | 'unknown']++);
        setViewCounts((prev) => ({
          ventral: prev.ventral + counts.ventral,
          dorsal: prev.dorsal + counts.dorsal,
          unknown: prev.unknown + counts.unknown,
        }));

        console.log('Fetched Photos:', cleaned.length, cleaned.slice(0, 5));
      }
      setLoading(false);
    };

    if (hasMore) fetchPhotos();
  }, [page]);

  const updatePhoto = async (photoId: string, updates: Partial<Photo>) => {
    const { error } = await supabase.from('manta-images').update(updates).eq('pk_photo_id', photoId);
    if (error) {
      console.error(`Failed to update photo ${photoId}:`, error);
    } else {
      setPhotos((prev) =>
        prev.map((p) => (p.pk_photo_id === photoId ? { ...p, ...updates } : p))
      );
    }
  };

  const filteredPhotos = photos.filter((photo) => {
    const viewKey = (photo.photo_type ?? 'unknown') as 'ventral' | 'dorsal' | 'unknown';
    const viewMatch = filterViews[viewKey];
    const catalogMatch = catalogIdFilter === '' || photo.fk_catalog_id?.includes(catalogIdFilter);
    const mantaMatch = mantaIdFilter === '' || photo.fk_manta_id?.includes(mantaIdFilter);
    return viewMatch && catalogMatch && mantaMatch;
  });

  if (sortBy === 'catalog') {
    filteredPhotos.sort((a, b) => (a.fk_catalog_id || '').localeCompare(b.fk_catalog_id || ''));
  } else if (sortBy === 'manta') {
    filteredPhotos.sort((a, b) => (a.fk_manta_id || '').localeCompare(b.fk_manta_id || ''));
  }

  const getCleanedStorageUrl = (path: string) => {
    const base = import.meta.env.VITE_SUPABASE_STORAGE_URL?.replace(/\/$/, '') || '';
    return path.startsWith('http') ? path : `${base}/${path}`;
  };

  return (
    <Layout>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Missing Sighting Photos</h1>

        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-2">
              <Label className="font-semibold text-md">Filter by:</Label>
              <Input placeholder="Catalog ID" value={catalogIdFilter} onChange={(e) => setCatalogIdFilter(e.target.value)} />
              <Input placeholder="Manta ID" value={mantaIdFilter} onChange={(e) => setMantaIdFilter(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>View</Label>
              {(['ventral', 'dorsal', 'unknown'] as const).map((view) => (
                <div key={view} className="flex items-center gap-2">
                  <Checkbox
                    id={`view-${view}`}
                    checked={filterViews[view]}
                    onCheckedChange={(checked) => setFilterViews((prev) => ({ ...prev, [view]: Boolean(checked) }))}
                  />
                  <Label htmlFor={`view-${view}`}>{view} ({viewCounts[view]})</Label>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setFilterViews({ ventral: true, dorsal: true, unknown: true })}>Show All</Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sort-select">Sort by</Label>
              <Select value={sortBy} onValueChange={(val) => setSortBy(val as any)}>
                <SelectTrigger id="sort-select">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="catalog">Catalog ID</SelectItem>
                  <SelectItem value="manta">Manta ID</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mt-6">
              <Button variant="outline" className="bg-blue-100 text-blue-800" onClick={() => {
                setFilterViews({ ventral: false, dorsal: false, unknown: false });
                setCatalogIdFilter('');
                setMantaIdFilter('');
                setSortBy('none');
              }}>Clear Filters</Button>
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {filteredPhotos.length} photo(s) displayed (from {photos.length} total)
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredPhotos.map((photo) => (
            <Card key={`photo-${photo.pk_photo_id}`} className="overflow-hidden">
              <img
                src={getCleanedStorageUrl(photo.storage_path)}
                alt="Manta"
                onError={(e) => (e.currentTarget.src = '/fallback.png')}
                className="w-full h-48 object-cover bg-gray-100"
                loading="lazy"
              />
              <CardContent className="p-4 space-y-2">
                <Label className="block">View</Label>
                {(['ventral', 'dorsal', 'unknown'] as const).map((view) => (
                  <div key={`${photo.pk_photo_id}-${view}`} className="flex items-center gap-2">
                    <Checkbox
                      id={`${photo.pk_photo_id}-${view}`}
                      checked={photo.photo_type === view}
                      onCheckedChange={() => updatePhoto(photo.pk_photo_id, { photo_type: view })}
                    />
                    <Label htmlFor={`${photo.pk_photo_id}-${view}`}>{view}</Label>
                  </div>
                ))}

                <div className="flex items-center gap-2 pt-2">
                  <Checkbox
                    id={`best-${photo.pk_photo_id}`}
                    checked={photo.is_best_manta_ventral_photo}
                    onCheckedChange={(val) => updatePhoto(photo.pk_photo_id, { is_best_manta_ventral_photo: Boolean(val) })}
                  />
                  <Label htmlFor={`best-${photo.pk_photo_id}`}>Best Sighting Photo</Label>
                </div>

                <div className="text-xs text-muted-foreground space-x-2 pt-2">
                  {photo.fk_sighting_id && (
                    <a href={`/admin/review/sighting/${photo.fk_sighting_id}`} className="text-blue-600 hover:underline">View Sighting</a>
                  )}
                  {photo.fk_catalog_id && (
                    <a href={`/admin/catalog/${photo.fk_catalog_id}`} className="text-blue-600 hover:underline">View Catalog</a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {hasMore && !loading && (
          <div className="flex justify-center pt-6">
            <Button onClick={() => setPage((prev) => prev + 1)} variant="secondary">
              Load More
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
