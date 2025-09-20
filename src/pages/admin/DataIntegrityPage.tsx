import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Layout from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface IntegrityStats {
  mantas_missing_catalog: number;
  mantas_missing_sighting: number;
  photos_missing_manta: number;
  catalogs_missing_sightings: number;
  average_sightings_per_catalog: number | null;
  average_mantas_per_sighting: number | null;
  average_photos_per_manta: number | null;
}

export default function DataIntegrityPage() {
  const [stats, setStats] = useState<IntegrityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const safeFixed = (value: number | null | undefined) =>
    typeof value === 'number' ? value.toFixed(2) : '—';

  useEffect(() => {
    const fetchStats = async () => {
      console.log('[DEBUG] Fetching data integrity stats...');
      const { data, error } = await supabase.rpc('get_data_integrity_stats');
      console.log('[DEBUG] Supabase response:', { data, error });

      if (error) {
        console.error('[ERROR] RPC failed:', error.message);
        setError(error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        console.error('[ERROR] RPC returned null or undefined data');
        setError('No data returned from Supabase.');
        setLoading(false);
        return;
      }

      setStats(data);
      setLoading(false);
    };

    fetchStats();
  }, []);

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Data Integrity Report</h1>

        {loading && <p>🔄 Loading data integrity stats...</p>}
        {error && <p className="text-red-500">❌ {error}</p>}

        {!loading && !error && stats && (
          <div className="grid gap-4">
            <Card>
              <CardContent className="p-4 space-y-2">
                <h2 className="text-lg font-semibold">Missing Links</h2>
                <p>🔥 Mantas missing CatalogID: <Badge variant="destructive">{stats.mantas_missing_catalog ?? '—'}</Badge></p>
                <p>🌻 Mantas missing SightingID: <Badge variant="destructive">{stats.mantas_missing_sighting ?? '—'}</Badge></p>
                <p>🖼️ Photos not linked to Mantas: <Badge variant="destructive">{stats.photos_missing_manta ?? '—'}</Badge></p>
                <p>📚 Catalogs without Sightings: <Badge variant="destructive">{stats.catalogs_missing_sightings ?? '—'}</Badge></p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-2">
                <h2 className="text-lg font-semibold">Relationship Averages</h2>
                <p>📊 Avg. Sightings per Catalog: {safeFixed(stats.average_sightings_per_catalog)}</p>
                <p>📊 Avg. Mantas per Sighting: {safeFixed(stats.average_mantas_per_sighting)}</p>
                <p>📊 Avg. Photos per Manta: {safeFixed(stats.average_photos_per_manta)}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
