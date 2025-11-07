import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";

import { Eye } from "lucide-react";
import CatalogFilterBox, { FiltersState } from "@/components/catalog/CatalogFilterBox";
import CatalogBestPhotoModal from "@/pages/browse_data/modals/CatalogBestPhotoModal";
import CatalogSightingsQuickModal from "@/pages/browse_data/modals/CatalogSightingsQuickModal";
import SightingMantasQuickModal from "@/pages/browse_data/modals/SightingMantasQuickModal";

import { useIsAdmin } from "@/lib/isAdmin";
function _norm(v?: string | null): string {
  return (v ?? "").toString().normalize("NFC").trim().toLowerCase();
}
function _arrHas(active: string[], arr?: (string|null)[]|null, single?: string|null): boolean {
  if (active.length === 0) return true;
  const want = active.map(_norm);
  if (arr && arr.length) {
    const hay = arr.map(_norm);
    return hay.some(x => x && want.includes(x));
  }
  if (single) return want.includes(_norm(single));
  return false;
}



type CatalogRow = {
  pk_catalog_id: number;
  name: string | null;

  species?: string | null;
  gender?: string | null;
  age_class?: string | null;

  /* aggregates from the view */
  total_sightings?: number | null;
  first_sighting?: string | null;
  last_sighting?: string | null;

  /* filters */
  population?: string | null;   /* if your view keeps a single population */
  island?: string | null;       /* if your view keeps a single island */
  sitelocation?: string | null; /* legacy single site label for filtering */

  /* thumbs */
  best_catalog_ventral_thumb_url?: string | null;
  best_catalog_dorsal_thumb_url?: string | null;
  best_catalog_ventral_path?: string | null;
  best_catalog_dorsal_path?: string | null;
  thumbnail_url?: string | null;

  /* arrays exist in the view too, but not required by this component */
  populations?: string[] | null;
  islands?: string[] | null;
};

const EMPTY_FILTERS: FiltersState = {
  population: [],
  island: [],
  sitelocation: [],
  gender: [],
  age_class: [],
  species: [],
};

function computeFiltered(catalog:any[], search:any, filters:any, sortAsc:boolean){
  const norm=(v:any)=> (v??'').toString().normalize('NFC').trim().toLowerCase();
  const set=(arr:any[])=> new Set((arr||[]).map(norm));
  const overlaps=(sel:Set<string>, vals:(any[]|null|undefined))=>{
    if(!sel || sel.size===0) return true;
    if(!vals) return false;
    for(const v of vals){ if(sel.has(norm(v))) return true; }
    return false;
  };

  const sTxt=(search??'').toString().trim().toLowerCase();
  const popSel=set(filters?.population||[]);
  const islSel=set(filters?.island||[]);
  const locSel=set(filters?.sitelocation||[]);
  const genSel=set(filters?.gender||[]);
  const ageSel=set(filters?.age_class||[]);
  const spSel =set(filters?.species||[]);

  const out=(catalog||[]).filter((c:any)=>{
    const byText = (c?.name ? c.name.toLowerCase().includes(sTxt) : false) || String(c?.pk_catalog_id??'').includes(sTxt);
    const popOk = overlaps(popSel, c?.populations);
    const islOk = overlaps(islSel, c?.islands);
    const locVals = Array.isArray(c?.locations) ? c.sitelocations : (c?.sitelocation ? [c.sitelocation] : []);
    const locOk = overlaps(locSel, locVals);
    const genOk = genSel.size===0 || genSel.has(norm(c?.gender));
    const ageOk = ageSel.size===0 || ageSel.has(norm(c?.age_class));
    const spOk  = spSel.size===0  || spSel.has(norm(c?.species));
    return byText && popOk && islOk && locOk && genOk && ageOk && spOk;
  }).sort((a:any,b:any)=> sortAsc ? a.pk_catalog_id - b.pk_catalog_id : b.pk_catalog_id - a.pk_catalog_id);

  return out;
}

export default function Catalog() {
  const isAdmin = useIsAdmin();
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [viewMode, setViewMode] = useState<"ventral" | "dorsal">("ventral");
  const [sightingsCatalogId, setSightingsCatalogId] = useState<number | null>(null);
  const [openSightingId, setOpenSightingId] = useState<number | null>(null);
  const [selectedCatalogId, setSelectedCatalogId] = useState<number | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const catalogIdParam = searchParams.get("catalogId");

  const load = async () => {
    let q = supabase.from("catalog_with_photo_view").select("*");
    if (catalogIdParam) q = q.eq("pk_catalog_id", catalogIdParam);
    const { data, error } = await q;
    if (error) {
      console.error("[Load Catalog]", error);
      setCatalog([]);
    } else {
      setCatalog((data as unknown as CatalogRow[]) ?? []);
    }
  };

  useEffect(() => {
    load();
  }, [catalogIdParam]);

  const filtered = useMemo(() => {
  const term = (search || '').trim().toLowerCase();

  const textOK = (c: CatalogRow) =>
    (c.name ? c.name.toLowerCase().includes(term) : false) ||
    String(c.pk_catalog_id).includes(term);

  const arrHasAny = (need: string[], have?: string[] | null) =>
    !need.length || (Array.isArray(have) && have.some(v => need.includes(v)));

  const valOK = (need: string[], v?: string | null) =>
    !need.length || (v ? need.includes(v) : false);

  const rows = catalog.filter((c) =>
    textOK(c) &&
    arrHasAny(filters.population, c.populations) &&
    arrHasAny(filters.island, c.islands) &&
    valOK(filters.sitelocation, c.sitelocation) &&
    valOK(filters.gender, c.gender) &&
    valOK(filters.age_class, c.age_class) &&
    (!filters.species.length || (c.species ? filters.species.includes(c.species) : false))
  );

  rows.sort((a,b)=> (sortAsc ? a.pk_catalog_id - b.pk_catalog_id : b.pk_catalog_id - a.pk_catalog_id));
  return rows;
}, [catalog, search, filters, sortAsc]);

    const clearAll = () => {
    setSearch("");
    setFilters(EMPTY_FILTERS);
    setSortAsc(true);
    setSearchParams({});
  };

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (filters.population.length) parts.push(`Population: ${filters.population.join(", ")}`);
    if (filters.island.length) parts.push(`Island: ${filters.island.join(", ")}`);
    if (filters.sitelocation.length) parts.push(`Location: ${filters.sitelocation.join(", ")}`);
    if (filters.gender.length) parts.push(`Gender: ${filters.gender.join(", ")}`);
    if (filters.age_class.length) parts.push(`Age: ${filters.age_class.join(", ")}`);
    if (filters.species.length) parts.push(`Species: ${filters.species.join(", ")}`);
    return parts.join("; ");
  }, [filters]);

  const fmt = (d?: string | null) => {
    if (!d) return "—";
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return String(d);
      return dt.toLocaleDateString();
    } catch {
      return String(d ?? "—");
    }
  };

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
          const thumb =
            viewMode === "ventral"
              ? (e.best_catalog_ventral_thumb_url ?? e.thumbnail_url ?? "/manta-logo.svg")
              : (e.best_catalog_dorsal_thumb_url ?? e.thumbnail_url ?? "/manta-logo.svg");

          return (
            <Card key={e.pk_catalog_id} className="p-4 flex flex-col">
              {/* image + change */}
              <div className="flex flex-col items-center w-full">
                <img
                  src={thumb}
                  alt={e.name ?? "catalog"}
                  className="w-full aspect-square object-cover rounded border"
                  onError={(ev) => ((ev.currentTarget as HTMLImageElement).src = "/manta-logo.svg")}
                />
                {isAdmin && (<div
                  className="mt-1 w-full text-center text-xs text-blue-500 underline cursor-pointer"
                  onClick={() => setSelectedCatalogId(e.pk_catalog_id)}
                >
                  change
                </div>)}
              </div>

              {/* details */}
              <div className="mt-3">
                <div className="text-blue-600 font-bold">
                  <Link to={`/browse/catalog?catalogId=${e.pk_catalog_id}`} className="hover:underline">
                    {e.name ?? `Catalog ${e.pk_catalog_id}`}
                  </Link>
                </div>
                <div className="text-xs text-gray-700">Catalog ID: {e.pk_catalog_id}</div>
                <div className="text-xs text-gray-600">Species: {e.species || "—"}</div>
                <div className="text-xs text-gray-600">
                <div className="text-xs text-gray-600">Gender: {e.gender || "—"}</div>
                <div className="text-xs text-gray-600">Age Class: {e.age_class || "—"}</div>
                  First: {fmt(e.first_sighting)} · Last: {fmt(e.last_sighting)}
                </div>
              </div>

              {/* actions */}
              <div className="mt-3">
                <Link to={"/browse/sightings?catalogId=" + e.pk_catalog_id} className="inline-flex items-center text-xs px-2 py-1 bg-blue-600 text-white rounded"><Eye className="mr-1 h-3 w-3" /> View Sightings ({e.total_sightings ?? 0})</Link>
              </div>
            </Card>
          );
        })}
      </div>

      {selectedCatalogId !== null && (
        <CatalogBestPhotoModal
          open={true}
          onOpenChange={(o) => !o && setSelectedCatalogId(null)}
          pk_catalog_id={selectedCatalogId}
          view={viewMode} onSaved={() => load()}
        />
      )}
    </Layout>
  );
}
