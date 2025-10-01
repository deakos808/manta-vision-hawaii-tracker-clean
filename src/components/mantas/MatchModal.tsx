
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Row = {
  pk_catalog_id: number;
  name: string | null;
  gender?: string | null;
  age_class?: string | null;
  species?: string | null;
  last_size?: number | null;
  best_catalog_ventral_thumb_url?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  leftUrl: string;
  aMeta: { name?: string; gender?: string | null; ageClass?: string | null; meanSize?: number | null; };
  onChoose: (id: number) => void;
  onNoMatch: () => void;
};

export default function MatchModal({ open, onClose, leftUrl, aMeta, onChoose, onNoMatch }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data, error } = await supabase
        .from("catalog_with_photo_view")
        .select("pk_catalog_id,name,gender,age_class,species,last_size,best_catalog_ventral_thumb_url")
        .order("pk_catalog_id", { ascending: true });
      if (error) {
        console.error("[MatchModal] load", error);
        setRows([]);
      } else {
        setRows((data as any) ?? []);
      }
    })();
  }, [open]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r => String(r.pk_catalog_id).includes(s) || (r.name ?? "").toLowerCase().includes(s));
  }, [rows, search]);

  useEffect(() => { if (idx >= filtered.length) setIdx(0); }, [filtered.length]);

  if (!open) return null;
  const r = filtered[idx];

  return (
    <div className="fixed inset-0 z-[300001] bg-black/50" onClick={onClose}>
      <div className="mx-auto my-10 bg-white rounded shadow max-w-6xl w-[96%] p-4" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-between items-center mb-2">
          <div className="text-lg font-medium">Find Catalog Match</div>
          <button className="h-8 w-8 grid place-items-center rounded-full border" onClick={onClose}>×</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded p-3">
            <div className="text-sm text-gray-600 mb-2">Best ventral (temp)</div>
            <img src={leftUrl || "/manta-logo.svg"} alt="temp" className="w-full max-h-[60vh] object-contain bg-gray-50 rounded border" />
            <div className="mt-2 text-xs text-gray-700">
              <div>Temp name: {aMeta.name || "—"}</div>
              <div>Gender: {aMeta.gender || "—"}</div>
              <div>Age class: {aMeta.ageClass || "—"}</div>
              <div>Mean size: {aMeta.meanSize ?? "—"} cm</div>
            </div>
          </div>

          <div className="border rounded p-3">
            <input
              className="w-full border rounded px-2 py-1 text-sm mb-2"
              placeholder="Search by Catalog ID or name..."
              value={search}
              onChange={e=>setSearch(e.target.value)}
            />
            <div className="text-xs text-gray-600 mb-2">{filtered.length} of {rows.length} total</div>

            {r ? (
              <>
                <img
                  src={r.best_catalog_ventral_thumb_url || "/manta-logo.svg"}
                  alt={r.name ?? String(r.pk_catalog_id)}
                  className="w-full max-h-[50vh] object-contain bg-gray-50 rounded border"
                />
                <div className="mt-2 text-xs text-gray-700">
                  <div>Catalog {r.pk_catalog_id}: {r.name ?? "—"}</div>
                  <div>Gender: {r.gender || "—"} · Age class: {r.age_class || "—"} · Species: {r.species || "—"}</div>
                  <div>Last size: {r.last_size ?? "—"} cm</div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button className="px-2 py-1 border rounded" onClick={()=> setIdx(idx>0? idx-1 : filtered.length-1)}>Prev</button>
                  <button className="px-2 py-1 border rounded" onClick={()=> setIdx((idx+1)%filtered.length)}>Next</button>
                  <div className="ml-auto flex items-center gap-2">
                    <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={()=> onChoose(r.pk_catalog_id)}>This Matches</button>
                    <button className="px-3 py-2 border rounded" onClick={onNoMatch}>No Matches Found</button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-500">No records.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
