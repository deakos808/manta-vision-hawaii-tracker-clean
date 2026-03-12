import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import BackToTopButton from "@/components/browse/BackToTopButton";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import CatalogFilterBox, { FiltersState } from "@/components/catalog/CatalogFilterBox";
import CatalogBestPhotoModal from "@/pages/browse_data/modals/CatalogBestPhotoModal";
import CatalogSightingsQuickModal from "@/pages/browse_data/modals/CatalogSightingsQuickModal";
import SightingMantasQuickModal from "@/pages/browse_data/modals/SightingMantasQuickModal";
import CatalogStatsModal from "@/pages/browse_data/modals/CatalogStatsModal";
import CatalogSizesQuickModal from "@/pages/browse_data/modals/CatalogSizesQuickModal";
import CatalogBiopsiesQuickModal from "@/pages/browse_data/modals/CatalogBiopsiesQuickModal";

type CatalogRow = {
  pk_catalog_id: number;
  name: string | null;
  species?: string | null;
  gender?: string | null;
  age_class?: string | null;
  total_sightings?: number | null;
  first_sighting?: string | null;
  last_sighting?: string | null;
  population?: string | null;
  island?: string | null;
  sitelocation?: string | null;
  best_catalog_ventral_thumb_url?: string | null;
  best_catalog_dorsal_thumb_url?: string | null;
  best_catalog_ventral_path?: string | null;
  best_catalog_dorsal_path?: string | null;
  thumbnail_url?: string | null;
  populations?: string[] | null;
  islands?: string[] | null;
  total_sizes?: number | null;
  total_biopsies?: number | null;
  mprf?: "MPRF" | "Non-MPRF" | null;
};

const EMPTY_FILTERS: FiltersState = {
  population: [],
  island: [],
  sitelocation: [],
  gender: [],
  age_class: [],
  species: [],
  mprf: [],
};

function fmt(d?: string | null) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString();
  } catch {
    return String(d ?? "—");
  }
}

async function fetchPagedCatalogRows(catalogIdParam: string | null): Promise<CatalogRow[]> {
  if (catalogIdParam) {
    const { data, error } = await supabase
      .from("catalog_with_photo_view")
      .select("*")
      .eq("pk_catalog_id", catalogIdParam);

    if (error) throw error;
    return (data as CatalogRow[]) ?? [];
  }

  const pageSize = 1000;
  const allRows: CatalogRow[] = [];

  for (let from = 0; from < 500000; from += pageSize) {
    const { data, error } = await supabase
      .from("catalog_with_photo_view")
      .select("*")
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const chunk = (data as CatalogRow[]) ?? [];
    allRows.push(...chunk);

    if (chunk.length < pageSize) break;
  }

  return allRows;
}

async function fetchSizeCounts(): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const pageSize = 1000;

  for (let from = 0; from < 500000; from += pageSize) {
    const { data, error } = await supabase
      .from("v_sizes_card_rows_v3")
      .select("pk_catalog_id,total_sizes")
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("[Catalog] size counts error:", error);
      break;
    }

    const chunk = data ?? [];
    for (const row of chunk as any[]) {
      const id = Number(row?.pk_catalog_id ?? 0);
      if (!id) continue;
      out.set(id, Number(row?.total_sizes ?? 0) || 0);
    }

    if (chunk.length < pageSize) break;
  }

  return out;
}

async function fetchBiopsyCounts(): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const pageSize = 1000;

  for (let from = 0; from < 500000; from += pageSize) {
    const { data, error } = await supabase
      .from("biopsies")
      .select("fk_catalog_id")
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("[Catalog] biopsy counts error:", error);
      break;
    }

    const chunk = data ?? [];
    for (const row of chunk as any[]) {
      const id = Number(row?.fk_catalog_id ?? 0);
      if (!id) continue;
      out.set(id, (out.get(id) || 0) + 1);
    }

    if (chunk.length < pageSize) break;
  }

  return out;
}

async function fetchCatalogMprfMap(): Promise<Map<number, "MPRF" | "Non-MPRF">> {
  const out = new Map<number, "MPRF" | "Non-MPRF">();
  const sightingMprf = new Map<number, boolean>();
  const pageSize = 1000;

  for (let from = 0; from < 500000; from += pageSize) {
    const { data, error } = await supabase
      .from("sightings")
      .select("pk_sighting_id,is_mprf")
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("[Catalog] sighting MPRF error:", error);
      break;
    }

    const chunk = data ?? [];
    for (const row of chunk as any[]) {
      const sid = Number(row?.pk_sighting_id ?? 0);
      if (!sid) continue;
      sightingMprf.set(sid, !!row?.is_mprf);
    }

    if (chunk.length < pageSize) break;
  }

  for (let from = 0; from < 500000; from += pageSize) {
    const { data, error } = await supabase
      .from("mantas")
      .select("fk_catalog_id,fk_sighting_id")
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("[Catalog] manta MPRF linkage error:", error);
      break;
    }

    const chunk = data ?? [];
    for (const row of chunk as any[]) {
      const cid = Number(row?.fk_catalog_id ?? 0);
      const sid = Number(row?.fk_sighting_id ?? 0);
      if (!cid || !sid) continue;

      const label: "MPRF" | "Non-MPRF" = sightingMprf.get(sid) ? "MPRF" : "Non-MPRF";
      const prev = out.get(cid);

      if (prev !== "MPRF") {
        out.set(cid, label);
      }
    }

    if (chunk.length < pageSize) break;
  }

  return out;
}

export default function Catalog() {
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [viewMode, setViewMode] = useState<"ventral" | "dorsal">("ventral");
  const [catalogIdPrefix, setCatalogIdPrefix] = useState("");
  const [namePrefix, setNamePrefix] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [selectedCatalogId, setSelectedCatalogId] = useState<number | null>(null);
  const [sightingsCatalogId, setSightingsCatalogId] = useState<number | null>(null);
  const [sizesCatalogId, setSizesCatalogId] = useState<number | null>(null);
  const [biopsiesCatalogId, setBiopsiesCatalogId] = useState<number | null>(null);
  const [openSightingId, setOpenSightingId] = useState<number | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const catalogIdParam = searchParams.get("catalogId");

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setIsAdmin(false);
          return;
        }

        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        const role = (data as any)?.role ?? null;
        setIsAdmin(role === "admin" || role === "database_manager");
      } catch {
        setIsAdmin(false);
      }
    })();
  }, []);

  async function load() {
    try {
      const [rows, sizeCounts, biopsyCounts, mprfMap] = await Promise.all([
        fetchPagedCatalogRows(catalogIdParam),
        fetchSizeCounts(),
        fetchBiopsyCounts(),
        fetchCatalogMprfMap(),
      ]);

      const merged = rows.map((row) => ({
        ...row,
        total_sizes: sizeCounts.get(row.pk_catalog_id) ?? 0,
        total_biopsies: biopsyCounts.get(row.pk_catalog_id) ?? 0,
        mprf: mprfMap.get(row.pk_catalog_id) ?? null,
      }));

      setCatalog(merged);
    } catch (error) {
      console.error("[Load Catalog]", error);
      setCatalog([]);
    }
  }

  useEffect(() => {
    load();
  }, [catalogIdParam]);

  const filtered = useMemo(() => {
    const term = (search || "").trim().toLowerCase();
    const cidPrefix = (catalogIdPrefix || "").trim();
    const nPrefix = (namePrefix || "").trim().toLowerCase();

    const arrHasAny = (need: string[], have?: string[] | null) =>
      !need.length || (Array.isArray(have) && have.some((v) => need.includes(v)));

    const valOK = (need: string[], v?: string | null) =>
      !need.length || (v ? need.includes(v) : false);

    const rows = catalog.filter((c) => {
      const textOK =
        !term ||
        (c.name ? c.name.toLowerCase().includes(term) : false) ||
        String(c.pk_catalog_id).includes(term);

      const catalogPrefixOK = !cidPrefix || String(c.pk_catalog_id).startsWith(cidPrefix);
      const namePrefixOK = !nPrefix || String(c.name ?? "").toLowerCase().startsWith(nPrefix);

      return (
        textOK &&
        catalogPrefixOK &&
        namePrefixOK &&
        arrHasAny(filters.population, c.populations) &&
        arrHasAny(filters.island, c.islands) &&
        valOK(filters.sitelocation, c.sitelocation) &&
        valOK(filters.gender, c.gender) &&
        valOK(filters.age_class, c.age_class) &&
        valOK(filters.mprf, c.mprf) &&
        (!filters.species.length || (c.species ? filters.species.includes(c.species) : false))
      );
    });

    rows.sort((a, b) =>
      sortAsc ? a.pk_catalog_id - b.pk_catalog_id : b.pk_catalog_id - a.pk_catalog_id
    );

    return rows;
  }, [catalog, search, catalogIdPrefix, namePrefix, filters, sortAsc]);

  const clearAll = () => {
    setSearch("");
    setFilters(EMPTY_FILTERS);
    setSortAsc(true);
    setCatalogIdPrefix("");
    setNamePrefix("");
    setSearchParams({});
  };

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (catalogIdPrefix) parts.push(`Catalog ID starts with: ${catalogIdPrefix}`);
    if (namePrefix) parts.push(`Name starts with: ${namePrefix}`);
    if (filters.population.length) parts.push(`Population: ${filters.population.join(", ")}`);
    if (filters.island.length) parts.push(`Island: ${filters.island.join(", ")}`);
    if (filters.sitelocation.length) parts.push(`Location: ${filters.sitelocation.join(", ")}`);
    if (filters.gender.length) parts.push(`Gender: ${filters.gender.join(", ")}`);
    if (filters.age_class.length) parts.push(`Age: ${filters.age_class.join(", ")}`);
    if (filters.species.length) parts.push(`Species: ${filters.species.join(", ")}`);
    if (filters.mprf.length) parts.push(`MPRF: ${filters.mprf.join(", ")}`);
    if (viewMode) parts.push(`Photo View: ${viewMode}`);
    return parts.join("; ");
  }, [catalogIdPrefix, namePrefix, filters, viewMode]);

  return (
    <Layout title="Catalog">
      <div className="bg-blue-600 text-white py-6 px-4 sm:px-8 lg:px-16 shadow text-center">
        <h1 className="text-4xl font-bold">Catalog</h1>
      </div>

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
          viewMode={viewMode}
          setViewMode={setViewMode}
          catalogIdPrefix={catalogIdPrefix}
          setCatalogIdPrefix={setCatalogIdPrefix}
          namePrefix={namePrefix}
          setNamePrefix={setNamePrefix}
          onOpenStats={() => setStatsOpen(true)}
          isAdmin={isAdmin}
        />

        <div className="text-sm text-gray-700">
          {filtered.length} records showing of {catalog.length} total records
          {summary ? `, filtered by ${summary}` : ""}
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-12 pb-16 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
        {filtered.map((e) => {
          const thumb =
            viewMode === "ventral"
              ? e.best_catalog_ventral_thumb_url ?? e.thumbnail_url ?? "/manta-logo.svg"
              : e.best_catalog_dorsal_thumb_url ?? e.thumbnail_url ?? "/manta-logo.svg";

          return (
            <Card key={e.pk_catalog_id} className="p-2 flex flex-col">
              <div className="flex flex-col items-center w-full">
                <img
                  src={thumb}
                  alt={e.name ?? "catalog"}
                  className="w-full aspect-square object-cover rounded border"
                  onError={(ev) => {
                    (ev.currentTarget as HTMLImageElement).src = "/manta-logo.svg";
                  }}
                />
                <div
                  className="mt-1 w-full text-center text-xs text-blue-500 underline cursor-pointer"
                  onClick={() => setSelectedCatalogId(e.pk_catalog_id)}
                >
                  change
                </div>
              </div>

              <div className="mt-3 text-xs">
                <div className="text-blue-600 font-bold text-base leading-tight">
                  <Link to={`/browse/catalog?catalogId=${e.pk_catalog_id}`} className="hover:underline">
                    {e.name ?? `Catalog ${e.pk_catalog_id}`}
                  </Link>
                </div>
                <div className="text-gray-700">Catalog ID: {e.pk_catalog_id}</div>
                <div className="text-gray-600">Species: {e.species || "—"}</div>
                <div className="text-gray-600">Gender: {e.gender || "—"}</div>
                <div className="text-gray-600">Age Class: {e.age_class || "—"}</div>
                <div className="text-gray-600">
                  First: {fmt(e.first_sighting)} · Last: {fmt(e.last_sighting)}
                </div>
              </div>

              <div className="mt-3 text-xs space-y-1">
                <div className="text-gray-700">
                  Total Sightings:{" "}
                  <button
                    type="button"
                    className="text-blue-600 underline hover:text-blue-700"
                    onClick={() => setSightingsCatalogId(e.pk_catalog_id)}
                  >
                    {e.total_sightings ?? 0}
                  </button>
                </div>

                <div className="text-gray-700">
                  Total Sizes:{" "}
                  <button
                    type="button"
                    className="text-blue-600 underline hover:text-blue-700"
                    onClick={() => setSizesCatalogId(e.pk_catalog_id)}
                  >
                    {e.total_sizes ?? 0}
                  </button>
                </div>

                <div className="text-gray-700">
                  Total Biopsies:{" "}
                  <button
                    type="button"
                    className="text-blue-600 underline hover:text-blue-700"
                    onClick={() => setBiopsiesCatalogId(e.pk_catalog_id)}
                  >
                    {e.total_biopsies ?? 0}
                  </button>
                </div>
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
          view={viewMode}
          onSaved={() => load()}
        />
      )}

      {sightingsCatalogId !== null && (
        <CatalogSightingsQuickModal
          open={true}
          onOpenChange={(o) => !o && setSightingsCatalogId(null)}
          pk_catalog_id={sightingsCatalogId}
          onOpenMantas={(sid) => setOpenSightingId(sid)}
        />
      )}

      {sizesCatalogId !== null && (
        <CatalogSizesQuickModal
          open={true}
          onOpenChange={(o) => !o && setSizesCatalogId(null)}
          pk_catalog_id={sizesCatalogId}
        />
      )}

      {biopsiesCatalogId !== null && (
        <CatalogBiopsiesQuickModal
          open={true}
          onOpenChange={(o) => !o && setBiopsiesCatalogId(null)}
          pk_catalog_id={biopsiesCatalogId}
        />
      )}

      {openSightingId !== null && (
        <SightingMantasQuickModal
          open={true}
          onOpenChange={(o) => !o && setOpenSightingId(null)}
          pk_sighting_id={openSightingId}
        />
      )}

      <CatalogStatsModal
        open={statsOpen}
        onOpenChange={setStatsOpen}
        rows={catalog}
      />

      <BackToTopButton />
    </Layout>
  );
}
