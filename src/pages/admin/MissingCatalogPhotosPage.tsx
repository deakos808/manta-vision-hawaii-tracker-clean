// File: src/pages/admin/MissingCatalogPhotosPage.tsx

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Layout from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface MissingCatalogEntry {
  pk_catalog_id: number;
  name: string | null;
  best_cat_mask_ventral_id_int: number | null;
  photo_count: number;
  thumbnail_url: string | null;
}

export default function MissingCatalogPhotosPage() {
  const [entries, setEntries] = useState<MissingCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState<number | null>(null);

  useEffect(() => {
    const fetchMissing = async () => {
      const { data, error } = await supabase.from('missing_catalog_photos').select('*');
      if (error) {
        console.error('[ERROR] Fetching missing catalog photos:', error.message);
        setEntries([]);
      } else {
        setEntries(data as MissingCatalogEntry[]);
      }
      setLoading(false);
    };
    fetchMissing();
  }, []);

  const handleFix = async (catalogId: number) => {
    setFixing(catalogId);
    const { error } = await supabase.rpc('fix_missing_catalog_photo', { input_catalog_id: catalogId });
    if (error) {
      console.error(`[ERROR] Fixing catalog ${catalogId}:`, error.message);
    } else {
      // Optimistic remove; page can be refreshed to re-pull full list
      setEntries((prev) => prev.filter((e) => e.pk_catalog_id !== catalogId));
    }
    setFixing(null);
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Missing Catalog Best Photos</h1>

        {/* UPDATED SUBTITLE COPY */}
        <div className="text-sm text-muted-foreground">
          Showing {entries.length} catalog entries that need a best ventral photo set or synced.
        </div>

        {loading ? (
          <div>Loading...</div>
        ) : entries.length === 0 ? (
          <div className="text-green-600">✅ All catalog entries are synced with a best ventral photo.</div>
        ) : (
          <div className="grid gap-4">
            {entries.map((entry) => (
              <Card key={entry.pk_catalog_id}>
                <CardContent className="p-4 flex flex-col md:flex-row justify-between md:items-center gap-3">
                  <div>
                    <div><strong>Catalog ID:</strong> {entry.pk_catalog_id}</div>
                    <div><strong>Name:</strong> {entry.name ?? '—'}</div>
                    <div><strong>Mask Photo ID:</strong> {entry.best_cat_mask_ventral_id_int ?? '—'}</div>
                    <div className="flex items-center gap-2">
                      <strong>Photos:</strong> <Badge>{entry.photo_count ?? 0}</Badge>
                    </div>
                    <div className="mt-2">
                      <strong>Preview:</strong>{' '}
                      {entry.thumbnail_url ? (
                        <img
                          src={entry.thumbnail_url}
                          alt="preview"
                          className="h-16 w-auto mt-2 rounded border"
                        />
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>

                  <div className="shrink-0">
                    <Button
                      variant="secondary"
                      disabled={fixing === entry.pk_catalog_id}
                      onClick={() => handleFix(entry.pk_catalog_id)}
                    >
                      {fixing === entry.pk_catalog_id ? 'Fixing...' : '🛠 Fix Manually'}
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
