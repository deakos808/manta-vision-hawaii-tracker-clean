import { useEffect, useState } from 'react';
import Layout from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

type MatchResult = {
  pk_manta_id: number;
  fk_catalog_id: number;
  true_match_rank: number;
  match_score: number;
  photo_url: string;
  status: string;
};

export default function MantaPhotoDiagnosticsPage() {
  const [data, setData] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDiagnostics = async () => {
      setLoading(true);
      const res = await fetch('/rest/v1/manta_match_diagnostics_view?select=*', {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      });

      const json = await res.json();
      setData(json);
      setLoading(false);
    };

    fetchDiagnostics();
  }, []);

  // Summary Stats
  const top10 = data.filter((d) => d.true_match_rank <= 10).length;
  const top20 = data.filter((d) => d.true_match_rank <= 20).length;
  const top50 = data.filter((d) => d.true_match_rank <= 50).length;
  const over50 = data.filter((d) => d.true_match_rank > 50 || d.true_match_rank == null).length;

  return (
    <Layout title="Manta Photo Diagnostics">
      <div className="p-6 space-y-8">
        <h1 className="text-2xl font-bold">Manta Photo Diagnostics</h1>
        <p className="text-sm text-muted-foreground">Shows match rank and score for all embedded manta photos.</p>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="p-4"><div className="text-sm">Top 10</div><div className="text-xl font-bold">{top10}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-sm">Top 20</div><div className="text-xl font-bold">{top20}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-sm">Top 50</div><div className="text-xl font-bold">{top50}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-sm">&gt; 50 or N/A</div><div className="text-xl font-bold text-red-600">{over50}</div></CardContent></Card>

            </div>

            {/* Grid of Photos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-8">
              {data.map((entry) => (
                <Card key={entry.pk_manta_id}>
                  <img src={entry.photo_url} alt="manta" className="w-full h-40 object-cover rounded-t" />
                  <CardContent className="p-3 space-y-1 text-sm">
                    <div><strong>Manta ID:</strong> {entry.pk_manta_id}</div>
                    <div><strong>Catalog ID:</strong> {entry.fk_catalog_id}</div>
                    <div><strong>Rank:</strong> {entry.true_match_rank}</div>
                    <div><strong>Score:</strong> {entry.match_score?.toFixed(6)}</div>
                    <div><Badge>{entry.status}</Badge></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
