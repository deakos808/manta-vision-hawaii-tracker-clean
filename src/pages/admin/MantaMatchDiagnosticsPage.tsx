import { useEffect, useState } from "react";
import Layout from "@/components/layout/Layout";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface RankRow {
  pk_manta_id: number;
  pk_catalog_id: number;
  true_match_rank: number;
  match_score: number;
}

export default function MantaMatchDiagnosticsPage() {
  const [results, setResults] = useState<RankRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("manta_match_results_view")
          .select("pk_manta_id, pk_catalog_id, true_match_rank, match_score")
          .order("true_match_rank", { ascending: true });

        if (error) throw new Error(error.message);
        setResults(data ?? []);
        console.log("✅ Match results:", data);
      } catch (err) {
        console.error("❌ Error fetching match results:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const downloadCsv = () => {
    const headers = ["pk_manta_id", "pk_catalog_id", "true_match_rank", "match_score"];
    const csvRows = [
      headers.join(","),
      ...results.map((r) =>
        [r.pk_manta_id, r.pk_catalog_id, r.true_match_rank, r.match_score.toFixed(6)].join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `manta_match_results_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Layout title="Manta Match Diagnostics">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Manta Match Diagnostics</h1>
          <Button onClick={downloadCsv}>📤 Export CSV</Button>
        </div>

        <p className="text-sm text-muted-foreground">
          For each manta, shows the catalog ID it belongs to and the rank/score of that match.
        </p>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <Card>
            <CardContent className="p-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Manta ID</TableHead>
                    <TableHead>Catalog ID</TableHead>
                    <TableHead>Rank</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((row) => {
                    const bg =
                      row.true_match_rank === 1
                        ? "bg-green-50"
                        : row.true_match_rank <= 10
                        ? "bg-yellow-50"
                        : "bg-red-100";

                    return (
                      <TableRow key={`${row.pk_manta_id}-${row.pk_catalog_id}`} className={bg}>
                        <TableCell>{row.pk_manta_id}</TableCell>
                        <TableCell>{row.pk_catalog_id}</TableCell>
                        <TableCell>{row.true_match_rank}</TableCell>
                        <TableCell>{row.match_score.toFixed(6)}</TableCell>
                        <TableCell>
                          {row.true_match_rank === 1
                            ? "✅ Top Match"
                            : row.true_match_rank <= 10
                            ? "⚠️ Mid"
                            : "❌ Low"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
