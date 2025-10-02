import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import CatalogFilterBox, { type FiltersState } from "@/components/catalog/CatalogFilterBox";

type CatalogRow = {
  pk_catalog_id: number;
  name: string | null;
  species?: string | null;
  gender?: string | null;
  age_class?: string | null;
  population?: string | null;
  island?: string | null;
  sitelocation?: string | null;
  populations?: string[] | null;
  islands?: string[] | null;
  best_catalog_ventral_thumb_url?: string | null;
  best_catalog_ventral_path?: string | null;
  thumbnail_url?: string | null;
};

type Meta = {
  name?: string | null;
  gender?: string | null;
  ageClass?: string | null;
  meanSize?: number | null;
};

interface Props {
  open: boolean;
  onClose?: () => void;
  tempUrl?: string | null;
  aMeta?: Meta;
  onChoose?: (catalogId: number) => void;
  onNoMatch?: () => void;
}

const EMPTY_FILTERS: FiltersState = {
  population: [],
  island: [],
  sitelocation: [],
  gender: [],
  age_class: [],
  species: [],
};

const imgFromRow = (r?: CatalogRow): string =>
  (r?.best_catalog_ventral_thumb_url ||
    r?.best_catalog_ventral_path ||
    r?.thumbnail_url ||
    "/manta-logo.svg");

const hasAny = (needles: string[], hay?: (string | null)[] | null) =>
  needles.length === 0 || (hay ? hay.some((x) => x && needles.includes(x)) : false);

export default function MatchModal({
  open,
  onClose,
  tempUrl,
  aMeta,
  onChoose,
  onNoMatch,
}: Props) {
  const [leftSrc, setLeftSrc] = useState<string | null>(tempUrl ?? null);
  useEffect(() => { setLeftSrc(tempUrl ?? null); }, [tempUrl]);
  const safeClose = () => { try { if (onClose) onClose(); } catch (e) { console.warn("[MatchModal] onClose error", e); } };

  const safeClose = () => { if (typeof onClose === "function") onClose(); };

  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [sortAsc, setSortAsc] = useState(true);
  const [index, setIndex] = useState(0);

  // measure toolbar height so left column can pad-top to align images
  const toolsRef = useRef<HTMLDivElement | null>(null);
  const [toolsH, setToolsH] = useState(0);
  useLayoutEffect(() => {
    const measure = () => setToolsH(toolsRef.current ? toolsRef.current.offsetHeight : 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") safeClose(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("catalog_with_photo_view").select("*");
      if (!cancelled) {
        if (error) {
          console.error("[MatchModal] load", error);
          setRows([]);
        } else {
          setRows((data as unknown as CatalogRow[]) ?? []);
        }
        setIndex(0);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        const textOk =
          (r.name ? r.name.toLowerCase().includes(s) : false) ||
          String(r.pk_catalog_id).includes(s);
        const pops = r.populations ?? (r.population ? [r.population] : []);
        const islands = r.islands ?? (r.island ? [r.island] : []);
        const site = r.sitelocation ? [r.sitelocation] : [];
        const ok =
          hasAny(filters.population, pops) &&
          hasAny(filters.island, islands) &&
          hasAny(filters.sitelocation, site) &&
          hasAny(filters.gender, r.gender ? [r.gender] : []) &&
          hasAny(filters.age_class, r.age_class ? [r.age_class] : []) &&
          hasAny(filters.species, r.species ? [r.species] : []);
        return textOk && ok;
      })
      .sort((a, b) => (sortAsc ? a.pk_catalog_id - b.pk_catalog_id : b.pk_catalog_id - a.pk_catalog_id));
  }, [rows, search, filters, sortAsc]);

  useEffect(() => {
    if (filtered.length === 0) setIndex(0);
    else if (index > filtered.length - 1) setIndex(filtered.length - 1);
  }, [filtered.length, index]);

  if (!open) return null;
  const current = filtered[index];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={safeClose} />

      <div className="relative bg-white w-[min(1280px,96vw)] max-h-[92vh] rounded shadow overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="text-lg font-semibold">Find Catalog Match</div>
          <button type="button" className="h-8 w-8 grid place-items-center rounded hover:bg-gray-100" onClick={safeClose} aria-label="Close">×</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 max-h-[calc(92vh-56px)] overflow-auto">
          {/* left: reference - padded to align with right toolbar height */}
          <div className="border rounded p-3 bg-white" style={{ paddingTop: toolsH }}>
            <div className="text-sm font-medium mb-2">Best ventral (temp)</div>
            <div className="w-full h-[420px] grid place-items-center bg-gray-50 rounded">
              <img
                src={leftSrc || "/manta-logo.svg"}
                alt="temp"
                className="max-w-full max-h-full object-contain"
                onError={(ev)=>{ if (leftSrc && leftSrc.includes("/storage/v1/object/") && !leftSrc.includes("/storage/v1/object/public/")) { try { setLeftSrc(leftSrc.replace("/storage/v1/object/","/storage/v1/object/public/")); } catch(_) { (ev.currentTarget).src="/manta-logo.svg"; } } else { (ev.currentTarget).src="/manta-logo.svg"; } }}
              />
            </div>
            <div className="mt-3 text-xs text-gray-600 space-y-1">
              <div>Temp name: {aMeta?.name ?? "—"}</div>
              <div>Gender: {aMeta?.gender ?? "—"}</div>
              <div>Age class: {aMeta?.ageClass ?? "—"}</div>
              <div>Mean size: {aMeta?.meanSize != null ? `${aMeta.meanSize} cm` : "—"}</div>
            </div>
          </div>

          {/* right: catalog column with tools */}
          <div className="border rounded p-3 bg-white flex flex-col">
            <div ref={toolsRef}>
              <input
                className="border rounded px-3 py-2 text-sm w-full mb-2"
                placeholder="Search by Catalog ID or name…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setIndex(0); }}
              />
              <CatalogFilterBox
                catalog={rows}
                filters={filters}
                setFilters={(f) => { setFilters(f); setIndex(0); }}
                sortAsc={sortAsc}
                setSortAsc={setSortAsc}
                onClearAll={() => { setSearch(""); setFilters(EMPTY_FILTERS); setSortAsc(true); setIndex(0); }}
              />
              <div className="text-xs text-gray-600 mt-2">
                {filtered.length === 0 ? "0 of 0 total" : `${index + 1} of ${filtered.length} total`}
              </div>
            </div>

            <div className="mt-3 w-full h-[420px] grid place-items-center bg-gray-50 rounded">
              <img
                src={imgFromRow(current)}
                alt={current?.name ?? "catalog"}
                className="max-w-full max-h-full object-contain"
                onError={(ev) => ((ev.currentTarget as HTMLImageElement).src = "/manta-logo.svg")}
              />
            </div>

            <div className="mt-3 text-xs text-gray-700 space-y-1 min-h-[40px]">
              {loading && <div className="text-gray-500">Loading…</div>}
              {!loading && !current && <div className="text-gray-500">No records.</div>}
              {current && (
                <>
                  <div>Catalog {current.pk_catalog_id}{current.name ? `: ${current.name}` : ""}</div>
                  <div>{current.species || "—"} • {current.gender || "—"} • {current.age_class || "—"}</div>
                </>
              )}
            </div>

            <div className="mt-auto pt-3 border-t flex items-center justify-between">
              <div className="flex gap-2">
                <button type="button" className="px-3 py-1 rounded border text-sm disabled:opacity-50" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index <= 0 || filtered.length === 0}>Prev</button>
                <button type="button" className="px-3 py-1 rounded border text-sm disabled:opacity-50" onClick={() => setIndex((i) => Math.min(filtered.length - 1, i + 1))} disabled={index >= filtered.length - 1 || filtered.length === 0}>Next</button>
              </div>
              <div className="flex gap-2">
                <button type="button" className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50" disabled={!current} onClick={() => { if (current && onChoose) onChoose(current.pk_catalog_id); safeClose(); }}>This Matches</button>
                <button type="button" className="px-3 py-1 rounded border text-sm" onClick={() => { onNoMatch && onNoMatch(); safeClose(); }}>No Matches Found</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
