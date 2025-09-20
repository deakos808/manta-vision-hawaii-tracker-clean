import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import CatalogBestPhotoModal from "@/pages/browse_data/modals/CatalogBestPhotoModal";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";


import CatalogSightingsQuickModal from "@/pages/browse_data/modals/CatalogSightingsQuickModal";
import SightingMantasQuickModal from "@/pages/browse_data/modals/SightingMantasQuickModal";
import CatalogSightingsQuickModal from "@/pages/browse_data/modals/CatalogSightingsQuickModal";
import SightingMantasQuickModal from "@/pages/browse_data/modals/SightingMantasQuickModal";
import CatalogFilterBox, { FiltersState } from "@/components/catalog/CatalogFilterBox";

function toPublic(u?: string | null): string {
  if (!u) return "/manta-logo.svg";
  if (/^https?:\/\//i.test(u)) return u;
  const envAny: any = (import.meta as any).env || {};
  const base = (envAny.VITE_SUPABASE_URL ? String(envAny.VITE_SUPABASE_URL) : "").replace(/\/+$/, "");
  let p = String(u).replace(/^\/+/, "").replace(/^browse\//i, "");
  if (!base) return u;
  if (/^storage\/v1\/object\/public\//i.test(p)) return `${base}/${p}`;
  if (/^(manta-images|temp-images)\//i.test(p)) return `${base}/storage/v1/object/public/${p}`;
  if (/^photos\//i.test(p)) return `${base}/storage/v1/object/public/manta-images/${p}`;
  return `${base}/storage/v1/object/public/${p}`;
}
function bust(u: string): string { return u + (u.includes("?") ? "&" : "?") + "cb=" + Date.now(); }

function fmt(d?: string | null): string { if (!d) return "—"; try { const dt = new Date(d); if (isNaN(dt.getTime())) return String(d); return dt.toLocaleDateString(); } catch { return String(d ?? "—"); } }
type CatalogRow = {
pk_catalog_id: number;
  name: string | null;
  total_sightings?: number | null;
  species?: string | null;
  gender?: string | null;
  age_class?: string | null;
  population?: string | null;
  island?: string | null;
  location?: string | null;

  /* image-related columns that may or may not exist in your view */
  best_catalog_photo_url?: string | null;
  best_catalog_ventral_thumb_url?: string | null;
  best_catalog_ventral_path?: string | null;
  thumbnail_url?: string | null;
  first_sighting_date?: string | null;
  last_sighting_date?: string | null;
};

const EMPTY_FILTERS: FiltersState = {
  population: [],
  island: [],
  location: [],
  gender: [],
  age_class: [],
};

export default function Catalog() {
  const [selectedCatalogId, setSelectedCatalogId] = useState<number | null>(null);

  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [viewMode, setViewMode] = useState<"ventral" | "dorsal">("ventral");
const [sightingsCatalogId, setSightingsCatalogId] = useState<number | null>(null);
const [openSightingId, setOpenSightingId] = useState<number | null>(null);
const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [speciesFilter, setSpeciesFilter] = useState<"alfredi" | "birostris" | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const catalogIdParam = searchParams.get("catalogId");

  

  const load = async () => {
    let q = supabase.from("catalog_with_photo_view").select("*");
    if (catalogIdParam) q = q.eq("pk_catalog_id", catalogIdParam);
    const { data, error } = await q;
    console.log("[Catalog debug]", data?.slice(0, 3));
    if (error) {
      console.error("[Load Catalog]", error);
      setCatalog([]);
    } else {
      setCatalog((data as unknown as CatalogRow[]) ?? []);
    }
  };
// Load from your existing view (no breaking changes)
  useEffect(() => {
    load();
  }, [catalogIdParam]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const matches = (arr: string[], v?: string | null) =>
      arr.length === 0 || (v ? arr.includes(v) : false);

    return catalog
      .filter((c) => {
        const text =
          (c.name ? c.name.toLowerCase().includes(s) : false) ||
          String(c.pk_catalog_id).includes(s);
        const byFilters =
          matches(filters.population, c.population ?? undefined) &&
          matches(filters.island, c.island ?? undefined) &&
          matches(filters.location, c.location ?? undefined) &&
          matches(filters.gender, c.gender ?? undefined) &&
          matches(filters.age_class, c.age_class ?? undefined);
            const speciesOk = !speciesFilter || (c.species ? c.species.toLowerCase() === speciesFilter : false);
return text && byFilters && speciesOk;
      })
      .sort((a, b) =>
        sortAsc ? a.pk_catalog_id - b.pk_catalog_id : b.pk_catalog_id - a.pk_catalog_id
      );
  }, [catalog, search, filters, sortAsc, speciesFilter]);

  const clearAll = () => {
  setSearch("");
  setFilters(EMPTY_FILTERS);
  setSortAsc(true);
  setSpeciesFilter(null);
  setSearchParams({});
};

  const summary = useMemo(() => {
    const label: Record<keyof FiltersState, string> = {
      population: "Population",
      island: "Island",
      location: "Location",
      gender: "Gender",
      age_class: "Age Class",
    };
    return Object.entries(filters)
      .filter(([, arr]) => arr.length > 0)
      .map(([k, arr]) => `${label[k as keyof FiltersState]}: ${arr.join(", ")}`)
      .join("; ");
  }, [filters]);

  return (
    <Layout title="Catalog">
      {/* hero */}
      <div className="bg-blue-600 text-white py-6 px-4 sm:px-8 lg:px-16 shadow text-center">
        <h1 className="text-4xl font-bold">Catalog</h1>
      </div>

      {/* filters */}
      <div className="bg-blue-50 px-4 sm:px-8 lg:px-16 py-4 shadow-sm">
        <div className="text-sm text-blue-800 mb-2">
          <Link to="/browse/data" className="hover:underline">
            ← Return to Browse Data
          </Link>
        </div>

        <input
          className="mb-3 border rounded px-3 py-2 w-full sm:w-64 text-sm"
          placeholder="Search name or ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <CatalogFilterBox
          catalog={catalog}
          filters={filters}
          setFilters={setFilters}
          sortAsc={sortAsc}
          setSortAsc={setSortAsc}
          onClearAll={clearAll}
        />

                <div className="mt-2 flex items-center gap-2">
          <span className="text-sm font-medium">Species:</span>
          <Button size="sm" variant={speciesFilter === "alfredi" ? "default" : "outline"} onClick={() => setSpeciesFilter(speciesFilter === "alfredi" ? null : "alfredi")}>alfredi</Button>
          <Button size="sm" variant={speciesFilter === "birostris" ? "default" : "outline"} onClick={() => setSpeciesFilter(speciesFilter === "birostris" ? null : "birostris")}>birostris</Button>
        </div>
{/* view toggle + banner */}
        <div className="mt-3 flex flex-col gap-2">
          <div>
            <label className="text-sm font-medium mr-4">Photo View:</label>
            <Button
              variant={viewMode === "ventral" ? "default" : "outline"}
              className="mr-2"
              onClick={() => setViewMode("ventral")}
            >
              Ventral
            </Button>
            <Button
              variant={viewMode === "dorsal" ? "default" : "outline"}
              onClick={() => setViewMode("dorsal")}
            >
              Dorsal
            </Button>
          </div>

          <div className="text-sm text-gray-700">
            {filtered.length} records showing of {catalog.length} total records
            {summary ? `, filtered by ${summary}` : ""}
          </div>
        </div>
      </div>

      {/* list */}
      <div className="px-4 sm:px-6 lg:px-12 pb-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((e) => {
          // LEFT thumb: the newly added column, else fallbacks
          const leftThumb =
            e.best_catalog_ventral_thumb_url ??
            e.best_catalog_ventral_path ??
            e.thumbnail_url ??
            "/manta-logo.svg";

          // RIGHT thumb: your existing best-catalog (already maintained by triggers)
          const rightThumb =
            e.best_catalog_photo_url ??
            e.best_catalog_ventral_path ??
            e.thumbnail_url ??
            "/manta-logo.svg";

          return (
            <Card key={e.pk_catalog_id} className="p-4 flex flex-col">
  {/* image + change */}
  <div className="flex flex-col items-center w-full">
    <img
      src={viewMode === "ventral" ? (e.best_catalog_ventral_thumb_url ?? "/manta-logo.svg") : (e.best_catalog_dorsal_thumb_url ?? "/manta-logo.svg")}
      alt={e.name ?? "catalog"}
      className="w-full aspect-square object-cover rounded border cursor-zoom-in"
      onClick={() => setPreviewUrl(viewMode === "ventral" ? (e.best_catalog_ventral_thumb_url ?? "/manta-logo.svg") : (e.best_catalog_dorsal_thumb_url ?? "/manta-logo.svg"))}
    />
    <div
      className="mt-1 w-full text-center text-xs text-blue-500 underline cursor-pointer"
      onClick={() => setSelectedCatalogId(e.pk_catalog_id)}
    >change</div>
  </div>

  {/* details */}
  <div className="mt-3">
    <div className="text-blue-600 font-bold">
      <Link to={`/browse/catalog?catalogId=`} className="hover:underline">
        {e.name ?? `Catalog `}
      </Link>
    </div>
    <div className="text-xs text-gray-700">Catalog ID: {e.pk_catalog_id}</div>
    <div className="text-xs text-gray-600">Species: {e.species || "—"}</div>
    <div className="text-xs text-gray-600">First: {fmt(e.first_sighting_date)} · Last: {fmt(e.last_sighting_date)}</div>
  </div>

  {/* actions */}
  <div className="mt-3">
    <button type="button" onClick={() => setSightingsCatalogId(e.pk_catalog_id)} className="inline-flex items-center text-xs px-2 py-1 bg-blue-600 text-white rounded"><Eye className="mr-1 h-3 w-3" /> View Sightings ({e.total_sightings ?? 0})</button>
  </div>
</Card>
          );
        })}
      </div>
    
  {selectedCatalogId !== null && (
    <CatalogBestPhotoModal open={true} onOpenChange={(o) => !o && setSelectedCatalogId(null)} pk_catalog_id={selectedCatalogId}
      onSaved={(thumb) => {
        if (thumb !== undefined && selectedCatalogId !== null) {
          setCatalog(prev => prev.map(r => r.pk_catalog_id === selectedCatalogId
            ? { ...r, best_catalog_ventral_thumb_url: (thumb ?? r.best_catalog_ventral_thumb_url) }
            : r));
        }
      }} />
  )}
{previewUrl && (<Dialog open onOpenChange={(o) => !o && setPreviewUrl(null)}><DialogContent className="max-w-3xl"><img src={previewUrl} alt="preview" className="w-full h-auto rounded" /></DialogContent></Dialog>)}
{typeof sightingsCatalogId === "number" && (
  <CatalogSightingsQuickModal
    open={true}
    onOpenChange={(o)=> !o && setSightingsCatalogId(null)}
    pk_catalog_id={sightingsCatalogId!}
    onOpenMantas={(sid)=> setOpenSightingId(sid)}
  />
)}
{typeof openSightingId === "number" && (
  <SightingMantasQuickModal
    open={true}
    onOpenChange={(o)=> !o && setOpenSightingId(null)}
    pk_sighting_id={openSightingId!}
  />
)}
</Layout>
  );
}
