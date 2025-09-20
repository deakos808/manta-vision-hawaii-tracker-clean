// File: src/pages/admin/MantaDiagnosticsPage.tsx
import { useEffect, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface MantaEmbedding {
  fk_manta_id: number;
  photo_id: number;
  score: number;
}

export default function MantaDiagnosticsPage() {
  const [data, setData] = useState<MantaEmbedding[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulated fetch from local JSON
    const fetchData = async () => {
      try {
        const res = await fetch("/sample-data/manta_embeddings_results.json");
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Failed to load manta embeddings", err);
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const scoreBuckets =
    data?.reduce<Record<string, number>>((acc, m) => {
      const bucket = Math.floor(m.score * 10) / 10;
      const label = bucket.toFixed(1);
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {}) ?? {};

  const distribution = Object.entries(scoreBuckets).map(([score, count]) => ({
    score,
    count,
  }));

  const anomalies = data
    ?.filter((m) => m.score < 0.95)
    .sort((a, b) => a.score - b.score)
    .slice(0, 20);

  return (
    <Layout title="Manta Embedding Diagnostics">
      <div className="p-6 space-y-8">
        <h1 className="text-2xl font-bold">Manta Embedding Diagnostics</h1>
        <p className="text-muted-foreground text-sm">
          Score distribution and anomalies in manta_embeddings table.
        </p>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <Card>
              <CardContent className="p-6">
                <h2 className="font-semibold mb-4">Cosine Score Distribution</h2>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={distribution}>
                      <XAxis dataKey="score" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {anomalies && anomalies.length > 0 && (
              <Card>
                <CardContent className="p-6">
                  <h2 className="font-semibold mb-4">Lowest Scoring Embeddings</h2>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Manta ID</TableHead>
                        <TableHead>Photo ID</TableHead>
                        <TableHead>Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {anomalies.map((m) => (
                        <TableRow key={m.fk_manta_id}>
                          <TableCell>{m.fk_manta_id}</TableCell>
                          <TableCell>{m.photo_id}</TableCell>
                          <TableCell>{m.score.toFixed(6)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
