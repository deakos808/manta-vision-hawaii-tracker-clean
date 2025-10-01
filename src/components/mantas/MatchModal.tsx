
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type CatalogRow = {
  pk_catalog_id: number;
  name?: string | null;
  gender?: string | null;
  age_class?: string | null;
  species?: string | null;
  best_catalog_ventral_thumb_url?: string | null;
  thumbnail_url?: string | null;
  last_size_cm?: number | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  aMeta: { name?: string; gender?: string | null; ageClass?: string | null; meanSize?: number | string | null };
  onChoose: (catalogId: number) => void;
  onNoMatch: () => void;
};

export default function MatchModal({ open, onClose, imageUrl, aMeta, onChoose, onNoMatch }: Props) {
  const [all, setAll] = useState<CatalogRow[]>([]);
  const [search, setSearch] = useState("");
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("catalog_with_photo_view").select("*").limit(1000);
      if (error) { console.error("[MatchModal] load error", error.message); setAll([]); }
      else setAll((data as unknown as CatalogRow[]) ?? []);
      setIdx(0); setLoading(false);
    })();
  }, [open]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return all;
    return all.filter((r) => ((r.name ?? "").toLowerCase().includes(s)) || String(r.pk_catalog_id).includes(s));
  }, [all, search]);

  const cur = filtered[idx] ?? null;
  const countText = `${filtered.length} of ${all.length} total${search ? ` (filtered by "${search}")` : ""}`;

  if (!open) return null;
  const next = () => setIdx((i) => (filtered.length ? (i + 1) % filtered.length : 0));
  const prev = () => setIdx((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));

  return (
    <div className="fixed inset-0 z-[400000] bg-black/40" onClick={onClose}>
      <div className="absolute inset-6 bg-white rounded shadow-xl border overflow-hidden" onClick={(e)=>e.stopPropagation()}>
        <div className="p-3 border-b flex items-center justify-between">
          <div className="font-medium text-sm">Find Catalog Match</div>
          <button className="h-8 w-8 grid place-items-center rounded hover:bg-gray-100" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="p-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border rounded p-2">
            <div className="text-xs text-gray-600 mb-2">Best ventral (temp)</div>
            <img src={imageUrl} alt="temp" className="w-full max-h-[60vh] object-contain rounded border" />
            <div className="mt-2 text-xs text-gray-700 space-y-1">
              <div><span className="text-gray-500">Temp name:</span> {aMeta.name || "—"}</div>
              <div><span className="text-gray-500">Gender:</span> {aMeta.gender || "—"}</div>
              <div><span className="text-gray-500">Age class:</span> {aMeta.ageClass || "—"}</div>
              <div><span className="text-gray-500">Mean size:</span> {aMeta.meanSize ?? "—"} {aMeta.meanSize ? "cm" : ""}</div>
            </div>
          </div>

          <div className="border rounded p-2 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <input className="border rounded px-2 py-1 text-sm w-full" placeholder="Search by Catalog ID or name…" value={search} onChange={(e)=>{ setSearch(e.target.value); setIdx(0); }} />
              <div className="text-xs text-gray-600 whitespace-nowrap">{countText}</div>
            </div>

            <div className="flex-1 border rounded p-2 grid grid-rows-[1fr_auto]">
              <div className="flex items-center justify-center">
                {loading ? (
                  <div className="text-sm text-gray-500">Loading…</div>
                ) : !cur ? (
                  <div className="text-sm text-gray-500">No records.</div>
                ) : (
                  <img src={cur.best_catalog_ventral_thumb_url || cur.thumbnail_url || "/manta-logo.svg"} alt={cur.name || "catalog"} className="w-full max-h-[50vh] object-contain rounded border" onError={(ev)=>((ev.currentTarget as HTMLImageElement).src="/manta-logo.svg")} />
                )}
              </div>
              <div className="mt-2 text-xs text-gray-700">
                {!!cur && (<>
                  <div className="font-medium text-gray-800">Catalog {cur.pk_catalog_id}: {cur.name || "—"}</div>
                  <div>Gender: {cur.gender || "—"} · Age class: {cur.age_class || "—"} · Species: {cur.species || "—"}</div>
                  <div>Last size: {cur.last_size_cm ?? "—"}{cur.last_size_cm ? " cm" : ""}</div>
                </>)}
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between">
              <div className="flex gap-2">
                <button className="px-3 py-1 border rounded" onClick={prev} disabled={!filtered.length}>Prev</button>
                <button className="px-3 py-1 border rounded" onClick={next} disabled={!filtered.length}>Next</button>
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50" disabled={!cur} onClick={()=> cur && onChoose(cur.pk_catalog_id)}>This Matches</button>
                <button className="px-3 py-1 rounded border text-gray-700" onClick={onNoMatch}>No Matches Found</button>
              </div>
            </div>
          </div>
        </div>

        <div className="p-3 border-t text-right">
          <button className="px-3 py-2 rounded border" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
