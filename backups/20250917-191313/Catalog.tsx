cat > src/pages/browse_data/Catalog.tsx <<'TSX'
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import CatalogFilterBox, { FiltersState } from "@/components/catalog/CatalogFilterBox";
import CatalogBestPhotoModal from "@/pages/browse_data/modals/CatalogBestPhotoModal";

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
  first_sighting_date?: string | null;
  last_sighting_date?: string | null;

  best_catalog_ventral_thumb_url?: string | null;
  best_catalog_dorsal_thumb_url?: string | null;
  best_catalog_ventral_path?: string | null;
  best_catalog_dorsal_path?: string | null;
  thumbnail_url?: string | null;
};

const EMPTY_FILTERS: FiltersState = {
  population: [],
  island: [],
  sitelocation: [],
  gender: [],
  age_class: [],
  species: [],
};

export default function Catalog() {
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [viewMode, setViewMode] = useState<"ventral" | "dorsal">("ventral");
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
          matches(filters.sitelocation, c.location ?? undefined) &&
          matches(filters.gender, c.gender ?? undefined) &&
          matches(filters.age_class, c.age_class ?? undefined);
        const speciesOk =
          filters.species.length === 0 ||
          (c.species ? filters.species.includes(c.species) : false);

        return text && byFilters && speciesOk;
      })
      .sort((a, b) =>
        sortAsc ? a.pk_catalog_id - b.pk_catalog_id : b.pk_catalog_id - a.pk_catalog_id
      );
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
                <div
                  className="mt-1 w-full text-center text-xs text-blue-500 underline cursor-pointer"
                  onClick={() => setSelectedCatalogId(e.pk_catalog_id)}
                >
                  change
                </div>
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
                  First: {fmt(e.first_sighting_date)} · Last: {fmt(e.last_sighting_date)}
                </div>
              </div>

              {/* actions */}
              <div className="mt-3">
                <Link
                  to={"/browse/sightings?catalogId=" + e.pk_catalog_id}
                  className="inline-flex items-center text-xs px-2 py-1 bg-blue-600 text-white rounded"
                >
                  <Eye className="mr-1 h-3 w-3" /> View Sightings ({e.total_sightings ?? 0})
                </Link>
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
          onSaved={() => load()}
        />
      )}
    </Layout>
  );
}
TSX
