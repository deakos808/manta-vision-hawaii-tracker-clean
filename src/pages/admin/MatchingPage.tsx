// src/pages/admin/MatchingPage.tsx
import React, { useEffect, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

export default function MatchingPage() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [msg, setMsg] = useState<string>("");
  const pageSize = 50;

  async function fetchPage(p: number) {
    const from = (p - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await supabase
      .from("embedding_selfmatch_results")
      .select("pk_catalog_id, match_rank, similarity, is_correct_top_match", { count: "exact" })
      .order("pk_catalog_id")
      .range(from, to);
    if (error) throw error;
    setResults(data || []);
    setTotal(count || 0);
  }

  useEffect(() => {
    fetchPage(page).catch((e) => setMsg(`Load error: ${String(e?.message || e)}`));
  }, [page]);

  async function runSelfMatch() {
    setRunning(true);
    setMsg("");
    try {
      const res = await fetch("/functions/v1/catalog_selfmatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 100 }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Selfmatch failed");
      setMsg(`OK: processed ${j.processed ?? 0}`);
      setPage(1);
      await fetchPage(1);
    } catch (e: any) {
      setMsg(`Run error: ${String(e?.message || e)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Layout title="Matching Diagnostics">
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Matching Diagnostics</h1>
        <div className="flex gap-2 items-center">
          <Button onClick={runSelfMatch} disabled={running}>
            {running ? "Running..." : "Run Self-Match"}
          </Button>
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        </div>
        <p>
          Showing {results.length > 0 ? (page - 1) * pageSize + 1 : 0} – {Math.min(page * pageSize, total)} of {total} results
        </p>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 text-left">Catalog ID</th>
              <th className="p-2 text-left">Rank</th>
              <th className="p-2 text-left">Similarity</th>
              <th className="p-2 text-left">Correct?</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i} className={r.is_correct_top_match ? "" : "opacity-75"}>
                <td className="p-2">{r.pk_catalog_id}</td>
                <td className="p-2">{r.match_rank}</td>
                <td className="p-2">{Number(r.similarity).toFixed(4)}</td>
                <td className="p-2">{r.is_correct_top_match ? "✅" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-between">
          <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </Button>
          <Button disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>
            Next →
          </Button>
        </div>
      </div>
    </Layout>
  );
}
