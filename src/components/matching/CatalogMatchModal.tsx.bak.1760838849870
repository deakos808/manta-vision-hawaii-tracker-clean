import { useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

interface MatchCandidate {
  catalog_id: string;
  name: string | null;
  score: number;
  thumb_url: string;
  embedding: number[] | null;
  similarity_local?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  photoUrl: string;
  tempMantaId: string;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (magA * magB);
}

export default function CatalogMatchModal({ open, onClose, photoUrl, tempMantaId }: Props) {
  const [matches, setMatches] = useState<MatchCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryEmbedding, setQueryEmbedding] = useState<number[] | null>(null);
  const [tempPhotoId, setTempPhotoId] = useState<string | null>(null);
  const [limit] = useState(50);
  const [offset] = useState(0);

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      if (!open || !photoUrl) return;
      setLoading(true);
      setError(null);
      setQueryEmbedding(null);
      setMatches([]);

      try {
        const blob = await (await fetch(photoUrl)).blob();
        const tempId = uuidv4();
        setTempPhotoId(tempId);
        const filePath = `${tempId}/original.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('temp-images')
          .upload(filePath, blob, { upsert: true });
        if (uploadError) throw new Error('Upload failed');

        const publicUrl = `https://apweteosdbgsolmvcmhn.supabase.co/storage/v1/object/public/temp-images/${filePath}`;
        const { error: insertError } = await supabase
          .from('temp_photos')
          .upsert({ id: tempId, photo_url: publicUrl }, { onConflict: ['id'] });
        if (insertError) throw new Error('Insert failed');

        const embedRes = await fetch('https://apweteosdbgsolmvcmhn.functions.supabase.co/generate-newphoto-embedding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo_id: tempId }),
        });
        if (!embedRes.ok) {
          const errText = await embedRes.text();
          throw new Error('Embedding function failed: ' + errText);
        }

        // Wait for embedding
        let attempts = 0;
        let embedded: number[] | null = null;
        while (attempts < 10 && !ignore) {
          const { data, error } = await supabase
            .from('temp_photos')
            .select('embedding')
            .eq('id', tempId)
            .maybeSingle();

          if (error) throw error;
          if (data?.embedding) {
            embedded = data.embedding;
            break;
          }

          await new Promise((r) => setTimeout(r, 750));
          attempts++;
        }

        if (!embedded) throw new Error('Embedding not stored');
        setQueryEmbedding(embedded);

        // Match RPC
        const { data: matchData, error: matchError } = await supabase.rpc('match_temp_photo', {
          query_photo_id: tempId,
          result_limit: limit,
          result_offset: offset,
        });

        if (matchError) throw matchError;
        if (!Array.isArray(matchData)) throw new Error('Invalid match response');

        // Fetch embeddings
        const enriched = await Promise.all(
          matchData.map(async (m: any) => {
            const { data, error } = await supabase
              .from('catalog')
              .select('embedding')
              .eq('catalog_id', m.catalog_id)
              .maybeSingle();

            const catalogEmbedding = data?.embedding ?? null;
            const similarity_local =
              embedded && catalogEmbedding && catalogEmbedding.length === embedded.length
                ? cosineSimilarity(embedded, catalogEmbedding)
                : null;

            return {
              ...m,
              embedding: catalogEmbedding,
              similarity_local,
            };
          })
        );

        if (!ignore) setMatches(enriched);
      } catch (err: any) {
        if (!ignore) setError(err.message ?? 'Unknown error');
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    run();
    return () => {
      ignore = true;
    };
  }, [open, photoUrl, limit, offset]);

  const confirmMatch = useCallback(
    async (catalogId: string | null) => {
      await supabase
        .from('temp_mantas')
        .update({ suggested_catalog_id: catalogId, match_status: catalogId ? 'confirmed' : 'new' })
        .eq('id', tempMantaId);
      onClose();
    },
    [tempMantaId, onClose]
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh] overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>🔍 Match This Manta (Top {limit})</DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left: Query Image */}
          <div>
            <h3 className="text-sm font-medium text-gray-600 mb-1">Query Photo</h3>
            <img src={photoUrl} alt="query" className="w-full max-h-[400px] object-contain rounded border" />
            {queryEmbedding && (
              <pre className="text-xs mt-2 max-h-40 overflow-y-scroll bg-gray-100 rounded p-2 border border-gray-200">
                {JSON.stringify(queryEmbedding, null, 2)}
              </pre>
            )}
            <Button variant="outline" className="mt-4 w-full" onClick={() => confirmMatch(null)}>
              ➕ No Match – New Individual
            </Button>
          </div>

          {/* Right: All Matches */}
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-medium text-gray-600 mb-1">Ranked Matches</h3>
            {loading && <p className="text-blue-600">Loading…</p>}
            {error && <p className="text-red-600">Error: {error}</p>}
            {!loading && !error && matches.length === 0 && (
              <p className="text-gray-500">No matches returned.</p>
            )}
            {!loading &&
              matches.map((m, i) => (
                <div key={i} className="flex gap-4 border rounded p-3 shadow-sm">
                  <img
                    src={m.thumb_url}
                    alt={m.name || `Catalog ${m.catalog_id}`}
                    className="w-24 h-24 object-cover rounded border"
                  />
                  <div className="flex-1">
                    <div className="font-semibold">
                      {m.name || `Catalog ID ${m.catalog_id}`}
                    </div>
                    <div className="text-sm text-gray-500">
                      Server Score: <strong>{m.score.toFixed(4)}</strong>
                      <br />
                      Local Cosine: <strong>{m.similarity_local?.toFixed(4) ?? 'N/A'}</strong>
                    </div>
                    {m.embedding && (
                      <pre className="text-xs mt-1 max-h-20 overflow-y-scroll bg-gray-50 rounded p-2 border border-gray-200">
                        {JSON.stringify(m.embedding.slice(0, 20), null, 2)}{m.embedding.length > 20 ? ' ...' : ''}
                      </pre>
                    )}
                  </div>
                  <Button size="sm" onClick={() => confirmMatch(m.catalog_id)}>✅ Match</Button>
                </div>
              ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
