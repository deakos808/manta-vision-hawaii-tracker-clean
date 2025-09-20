import React, { useState } from 'react';
import Layout from '@/components/layout/Layout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (magA * magB);
}

export default function TestMatchPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [queryEmbedding, setQueryEmbedding] = useState<number[] | null>(null);
  const [allMatches, setAllMatches] = useState<{ id: string; similarity: number; thumb_url?: string }[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [knownCatalogId, setKnownCatalogId] = useState('');
  const [knownCatalogRank, setKnownCatalogRank] = useState<{ rank: number; similarity: number } | null>(null);

  const pageSize = 50;

  const parseVectorString = (str: string): number[] => {
    try {
      const parsed = JSON.parse(str);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    const url = URL.createObjectURL(f);
    setFile(f);
    setPreview(url);
    setQueryEmbedding(null);
    setAllMatches([]);
    setKnownCatalogRank(null);
    setError(null);
    setCurrentPage(1);
  };

  const runMatch = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setAllMatches([]);
    setKnownCatalogRank(null);

    try {
      const base64 = await fileToBase64(file);

      const embeddingRes = await fetch('http://localhost:5050/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64 }),
      });

      if (!embeddingRes.ok) {
        const errText = await embeddingRes.text();
        throw new Error('Embedding server error: ' + errText);
      }

      const { embedding } = await embeddingRes.json();
      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid embedding response');
      }

      setQueryEmbedding(embedding);

      const { data, error } = await supabase
        .from('catalog_embeddings')
        .select('catalog_id, embedding, catalog:catalog_id ( pk_catalog_id, best_catalog_photo_url )');

      if (error) throw error;

      const validRows = (data || [])
        .filter((row) => typeof row.embedding === 'string')
        .map((row) => ({
          id: row.catalog?.pk_catalog_id?.toString() || row.catalog_id,
          embedding: parseVectorString(row.embedding),
          thumb_url: row.catalog?.best_catalog_photo_url ?? null,
        }))
        .filter(
          (row) =>
            Array.isArray(row.embedding) &&
            row.embedding.length === embedding.length &&
            row.embedding.every((v) => typeof v === 'number' && !isNaN(v))
        );

      if (validRows.length === 0) throw new Error('No valid catalog embeddings found');

      const results = validRows
        .map((row) => {
          const sim = cosineSimilarity(embedding, row.embedding);
          return isNaN(sim)
            ? null
            : { id: row.id, similarity: sim, thumb_url: row.thumb_url || undefined };
        })
        .filter((r): r is { id: string; similarity: number; thumb_url?: string } => r !== null)
        .sort((a, b) => b.similarity - a.similarity);

      setAllMatches(results);

      if (knownCatalogId) {
        const matchIndex = results.findIndex(
          (m) => m.id === knownCatalogId || m.id === parseInt(knownCatalogId).toString()
        );
        if (matchIndex !== -1) {
          setKnownCatalogRank({
            rank: matchIndex + 1,
            similarity: results[matchIndex].similarity,
          });
        } else {
          setKnownCatalogRank(null);
        }
      }

      toast.success(`Top match: ${results[0].id} (${results[0].similarity.toFixed(5)})`);
    } catch (err: any) {
      console.error('[Match Error]', err);
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const pageMatches = allMatches.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-xl font-semibold mb-4">🧪 Top 50 Catalog Matches</h1>

        <Card className="p-4 space-y-4">
          <Label htmlFor="photo">Choose Photo</Label>
          <Input id="photo" type="file" accept="image/*" onChange={handleFile} />
          <div>
            <Label htmlFor="knownId">Known Catalog ID (pk_catalog_id)</Label>
            <Input
              id="knownId"
              placeholder="e.g. 312"
              type="text"
              value={knownCatalogId}
              onChange={(e) => setKnownCatalogId(e.target.value)}
              className="mt-1"
            />
          </div>
          <Button onClick={runMatch} disabled={!file || loading}>
            {loading ? 'Matching...' : 'Generate + Match'}
          </Button>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </Card>

        {queryEmbedding && (
          <div className="mt-6 flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              <h2 className="text-sm mb-1">Image Preview:</h2>
              {preview && <img src={preview} alt="preview" className="w-full max-w-sm rounded shadow border" />}
              <h2 className="text-sm font-semibold mt-4">📈 Query Embedding (first 20)</h2>
              <pre className="text-xs bg-gray-100 p-2 rounded border max-h-40 overflow-auto">
                {JSON.stringify(queryEmbedding.slice(0, 20), null, 2)}...
              </pre>
            </div>

            <div className="flex-1 max-h-[600px] overflow-y-auto border rounded p-4 shadow bg-white">
              <h2 className="text-sm font-semibold mb-3">🏆 Matches {pageMatches.length > 0 ? `(${allMatches.length} total)` : ''}</h2>

              {knownCatalogId && (
                <div className="mb-4 text-sm border rounded p-3 bg-yellow-50">
                  <h3 className="font-semibold text-yellow-900">🎯 Known Catalog ID: {knownCatalogId}</h3>
                  {knownCatalogRank ? (
                    <p>
                      Found at rank <strong>#{knownCatalogRank.rank}</strong> with similarity{' '}
                      <strong>{knownCatalogRank.similarity.toFixed(6)}</strong>
                    </p>
                  ) : (
                    <p className="text-red-600">Not found in top {allMatches.length} matches.</p>
                  )}
                </div>
              )}

              <ul className="space-y-3">
                {pageMatches.map((m, i) => {
                  const globalRank = (currentPage - 1) * pageSize + i + 1;
                  return (
                    <li key={m.id} className="text-sm border rounded p-3 bg-gray-50 shadow-sm flex items-start gap-4">
                      {m.thumb_url ? (
                        <img
                          src={m.thumb_url}
                          alt={`Catalog ${m.id}`}
                          className="w-20 h-20 object-cover rounded border"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-gray-200 rounded flex items-center justify-center text-xs text-muted-foreground">
                          No Image
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="font-semibold">#{globalRank} of {allMatches.length}</div>
                        <div className="text-xs text-muted-foreground">Catalog #</div>
                        <code className="block break-all text-xs mb-1">{m.id}</code>
                        <div>
                          Similarity: <strong>{m.similarity.toFixed(6)}</strong>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Pagination */}
              <div className="flex justify-between mt-4">
                <Button
                  variant="outline"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  ← Prev
                </Button>
                <Button
                  variant="outline"
                  disabled={currentPage * pageSize >= allMatches.length}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  Next →
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
