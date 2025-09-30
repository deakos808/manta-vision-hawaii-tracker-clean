import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Props = {
  open: boolean;
  onClose: () => void;
  ventralUrl: string;
  aMeta: { name?: string; gender?: string | null; ageClass?: string | null; meanSize?: number | null };
  onChoose: (id: number) => void;
  onNoMatch: () => void;
};

type Row = {
  pk_catalog_id: number;
  name: string | null;
  gender: string | null;
  age_class: string | null;
  best_catalog_ventral_thumb_url?: string | null;
  thumbnail_url?: string | null;
};

export default function MatchModal({ open, onClose, ventralUrl, aMeta, onChoose, onNoMatch }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [i, setI] = useState(0);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data, error } = await supabase
        .from("catalog_with_photo_view")
        .select("pk_catalog_id,name,gender,age_class,best_catalog_ventral_thumb_url,thumbnail_url")
        .order("pk_catalog_id", { ascending: true })
        .limit(500);
      if (error) { console.warn("[MatchModal] fetch error", error.message); setRows([]); }
      else setRows((data as any) || []);
      setI(0);
    })();
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r => (r.name ?? "").toLowerCase().includes(s) || String(r.pk_catalog_id).includes(s));
  }, [rows, q]);

  const cur = filtered[i] || null;
  const count = filtered.length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[500001] bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded shadow-lg w-[min(1100px,95vw)] max-h-[90vh] overflow-hidden" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-medium">Match (Best ventral)</div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center border rounded">&times;</button>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <img src={ventralUrl} alt="best ventral" className="w-full max-h-[60vh] object-contain rounded border" />
            <div className="text-sm mt-2">
              <div className="font-medium">This sighting</div>
              <div className="text-slate-600">Temp: {aMeta.name || "—"} · Gender: {aMeta.gender || "—"} · Age: {aMeta.ageClass || "—"} · Mean size: {aMeta.meanSize ?? "—"} cm</div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <input value={q} onChange={(e)=>setQ(e.target.value)} className="border rounded px-2 py-1 w-56" placeholder="Search ID or name…" />
              <div className="text-sm text-slate-600">{count} records{count>0 && cur ? ` · showing ID ${cur.pk_catalog_id}` : ""}</div>
            </div>

            <div className="border rounded p-2">
              {cur ? (
                <>
                  <img
                    src={cur.best_catalog_ventral_thumb_url || cur.thumbnail_url || "/manta-logo.svg"}
                    alt={cur.name ?? "catalog"}
                    className="w-full max-h-[50vh] object-contain rounded border"
                  />
                  <div className="text-sm mt-2">
                    <div className="font-medium">{cur.name ?? `Catalog ${cur.pk_catalog_id}`}</div>
                    <div className="text-slate-600">ID: {cur.pk_catalog_id} · Gender: {cur.gender || "—"} · Age: {cur.age_class || "—"}</div>
                  </div>

                  <div className="mt-3 flex justify-between">
                    <div className="flex gap-2">
                      <button className="px-3 py-2 border rounded" onClick={()=> setI(Math.max(0, i-1))}>Prev</button>
                      <button className="px-3 py-2 border rounded" onClick={()=> setI(Math.min(count-1, i+1))}>Next</button>
                    </div>
                    <div className="flex gap-2">
                      <button className="px-3 py-2 rounded bg-sky-600 text-white" onClick={()=> onChoose(cur.pk_catalog_id)}>This Matches</button>
                      <button className="px-3 py-2 rounded border text-red-600" onClick={onNoMatch}>No Matches Found</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-600">No results.</div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
