import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import Layout from "@/components/layout/Layout";
import BackToTopButton from "@/components/browse/BackToTopButton";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  last_size_m?: number | null;
  mprf?: "MPRF" | "HAMER" | null;
};

type SortField = "catalog_id" | "first_sighting" | "last_sighting" | "last_size";
type ExportPreset = "filtered_catalog_current_view" | "mobula_birostris_best_ventral";

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

async function fetchSizeCounts(): Promise<Map<number, { total_sizes: number; last_size_m: number | null }>> {
  const out = new Map<number, { total_sizes: number; last_size_m: number | null }>();
  const pageSize = 1000;

  for (let from = 0; from < 500000; from += pageSize) {
    const { data, error } = await supabase
      .from("v_sizes_card_rows_v3")
      .select("pk_catalog_id,total_sizes,last_size_m")
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("[Catalog] size counts error:", error);
      break;
    }

    const chunk = data ?? [];
    for (const row of chunk as any[]) {
      const id = Number(row?.pk_catalog_id ?? 0);
      if (!id) continue;
      const lastSize = row?.last_size_m == null ? null : Number(row.last_size_m);
      out.set(id, {
        total_sizes: Number(row?.total_sizes ?? 0) || 0,
        last_size_m: Number.isFinite(lastSize) ? lastSize : null,
      });
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

async function fetchCatalogMprfMap(): Promise<Map<number, "MPRF" | "HAMER">> {
  const out = new Map<number, "MPRF" | "HAMER">();
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

      const label: "MPRF" | "HAMER" = sightingMprf.get(sid) ? "MPRF" : "HAMER";
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
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("catalog_id");
  const [sortAsc, setSortAsc] = useState(true);
  const [viewMode, setViewMode] = useState<"ventral" | "dorsal">("ventral");
  const [catalogIdPrefix, setCatalogIdPrefix] = useState("");
  const [namePrefix, setNamePrefix] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const showHamrFilter = isAdmin;
  const [exportPreset, setExportPreset] = useState<ExportPreset>("filtered_catalog_current_view");
  const [exporting, setExporting] = useState(false);

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
    setLoading(true);
    try {
      const [rows, sizeCounts, biopsyCounts, mprfMap] = await Promise.all([
        fetchPagedCatalogRows(catalogIdParam),
        fetchSizeCounts(),
        fetchBiopsyCounts(),
        fetchCatalogMprfMap(),
      ]);

      const filteredRows = isAdmin ? rows : rows.filter((row) => (mprfMap.get(row.pk_catalog_id) ?? null) !== "MPRF");

      const merged = filteredRows.map((row) => {
        const sizeInfo = sizeCounts.get(row.pk_catalog_id) ?? { total_sizes: 0, last_size_m: null };
        return {
          ...row,
          total_sizes: sizeInfo.total_sizes,
          last_size_m: sizeInfo.last_size_m,
          total_biopsies: biopsyCounts.get(row.pk_catalog_id) ?? 0,
          mprf: mprfMap.get(row.pk_catalog_id) ?? null,
        };
      });

      setCatalog(merged);
    } catch (error) {
      console.error("[Load Catalog]", error);
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [catalogIdParam, isAdmin]);

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

    const toTime = (v?: string | null) => {
      if (!v) return null;
      const t = new Date(v).getTime();
      return Number.isNaN(t) ? null : t;
    };

    rows.sort((a, b) => {
      let cmp = 0;

      if (sortField === "catalog_id") {
        cmp = a.pk_catalog_id - b.pk_catalog_id;
      } else if (sortField === "last_size") {
        const av = a.last_size_m == null ? Number.NEGATIVE_INFINITY : a.last_size_m;
        const bv = b.last_size_m == null ? Number.NEGATIVE_INFINITY : b.last_size_m;
        cmp = av - bv;
        if (cmp === 0) cmp = a.pk_catalog_id - b.pk_catalog_id;
      } else if (sortField === "first_sighting") {
        const av = toTime(a.first_sighting);
        const bv = toTime(b.first_sighting);
        const ax = av == null ? Number.NEGATIVE_INFINITY : av;
        const bx = bv == null ? Number.NEGATIVE_INFINITY : bv;
        cmp = ax - bx;
        if (cmp === 0) cmp = a.pk_catalog_id - b.pk_catalog_id;
      } else if (sortField === "last_sighting") {
        const av = toTime(a.last_sighting);
        const bv = toTime(b.last_sighting);
        const ax = av == null ? Number.NEGATIVE_INFINITY : av;
        const bx = bv == null ? Number.NEGATIVE_INFINITY : bv;
        cmp = ax - bx;
        if (cmp === 0) cmp = a.pk_catalog_id - b.pk_catalog_id;
      }

      return sortAsc ? cmp : -cmp;
    });

    return rows;
  }, [catalog, search, catalogIdPrefix, namePrefix, filters, sortField, sortAsc]);

  const clearAll = () => {
    setSearch("");
    setFilters(EMPTY_FILTERS);
    setSortField("catalog_id");
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
    if (filters.mprf.length) parts.push(`Source: ${filters.mprf.join(", ")}`);
    if (viewMode) parts.push(`Photo View: ${viewMode}`);
    return parts.join("; ");
  }, [catalogIdPrefix, namePrefix, filters, viewMode]);

  const handleExportExcel = () => {
    try {
      setExporting(true);

      const sourceRows =
        exportPreset === "mobula_birostris_best_ventral"
          ? filtered.filter((row) => (row.species ?? "").toLowerCase() === "mobula birostris")
          : filtered;

      const rowsToExport = sourceRows.map((row) => {
        const previewUrl =
          viewMode === "ventral"
            ? row.best_catalog_ventral_thumb_url ?? ""
            : row.best_catalog_dorsal_thumb_url ?? "";

        return {
          catalog_id: row.pk_catalog_id ?? "",
          name: row.name ?? "",
          species: row.species ?? "",
          gender: row.gender ?? "",
          age_class: row.age_class ?? "",
          first_sighting: row.first_sighting ?? "",
          last_sighting: row.last_sighting ?? "",
          last_size_m: row.last_size_m ?? "",
          total_sightings: row.total_sightings ?? 0,
          total_sizes: row.total_sizes ?? 0,
          total_biopsies: row.total_biopsies ?? 0,
          mprf: row.mprf ?? "",
          populations: Array.isArray(row.populations) ? row.populations.join(", ") : "",
          islands: Array.isArray(row.islands) ? row.islands.join(", ") : "",
          sitelocation: row.sitelocation ?? "",
          image_link: previewUrl ? "Open Image" : "",
          best_catalog_ventral_thumb_url: row.best_catalog_ventral_thumb_url ?? "",
          best_catalog_ventral_path: row.best_catalog_ventral_path ?? "",
          best_catalog_dorsal_thumb_url: row.best_catalog_dorsal_thumb_url ?? "",
          best_catalog_dorsal_path: row.best_catalog_dorsal_path ?? "",
          current_photo_view: viewMode,
        };
      });

      const workbook = XLSX.utils.book_new();

      const summarySheet = XLSX.utils.json_to_sheet(rowsToExport);

      const headerKeys = Object.keys(rowsToExport[0] ?? {});
      const imageLinkCol = headerKeys.indexOf("image_link");

      if (imageLinkCol >= 0) {
        for (let i = 0; i < sourceRows.length; i += 1) {
          const previewUrl =
            viewMode === "ventral"
              ? sourceRows[i]?.best_catalog_ventral_thumb_url ?? ""
              : sourceRows[i]?.best_catalog_dorsal_thumb_url ?? "";

          if (!previewUrl) continue;

          const safeUrl = String(previewUrl).replace(/"/g, '""');
          const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: imageLinkCol });
          summarySheet[cellRef] = {
            t: "str",
            f: `HYPERLINK("${safeUrl}","Open Image")`,
            v: "Open Image",
          };
        }
      }

      XLSX.utils.book_append_sheet(workbook, summarySheet, "Catalog Summary");

      const notesRows = [
        { field: "export_preset", value: exportPreset },
        { field: "exported_at", value: new Date().toISOString() },
        { field: "row_count", value: String(rowsToExport.length) },
        { field: "photo_view", value: viewMode },
        { field: "filter_summary", value: summary || "none" },
      ];
      const notesSheet = XLSX.utils.json_to_sheet(notesRows);
      XLSX.utils.book_append_sheet(workbook, notesSheet, "Export Notes");

      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const filename =
        exportPreset === "mobula_birostris_best_ventral"
          ? `catalog_mobula_birostris_best_ventral_${stamp}.xlsx`
          : `catalog_filtered_current_view_${stamp}.xlsx`;

      XLSX.writeFile(workbook, filename);
    } catch (error) {
      console.error("[Catalog export]", error);
      alert("Catalog export failed. Check console for details.");
    } finally {
      setExporting(false);
    }
  };

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
          sortField={sortField}
          setSortField={setSortField}
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
        
          showMprfFilter={showHamrFilter}
        />

        {isAdmin && (
          <div className="mb-3 flex flex-col gap-2 rounded border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="text-sm font-medium text-gray-700">Export to Excel:</div>

              <select
                value={exportPreset}
                onChange={(e) =>
                  setExportPreset(e.target.value as "filtered_catalog_current_view" | "mobula_birostris_best_ventral")
                }
                className="rounded border px-3 py-2 text-sm bg-white"
              >
                <option value="filtered_catalog_current_view">Current filtered catalog view</option>
                <option value="mobula_birostris_best_ventral">Mobula birostris best ventral</option>
              </select>

              <Button type="button" variant="outline" onClick={handleExportExcel} disabled={exporting || loading}>
                {exporting ? "Exporting..." : "Export Excel"}
              </Button>
            </div>

            <div className="text-xs text-gray-500">
              Exports {exportPreset === "mobula_birostris_best_ventral" ? "filtered mobula birostris rows" : "current filtered/sorted rows"} as .xlsx
            </div>
          </div>
        )}

        <div className="text-sm text-gray-700">
          {!loading ? `${filtered.length} records showing of ${catalog.length} total records${summary ? `, filtered by ${summary}` : ""}` : ""}
        </div>
      </div>

      {loading ? (
        <div className="px-4 sm:px-6 lg:px-12 pb-16">
          <div className="text-sm text-muted-foreground py-6">Loading...</div>
        </div>
      ) : (
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
                {isAdmin && (
                  <div
                    className="mt-1 w-full text-center text-xs text-blue-500 underline cursor-pointer"
                    onClick={() => setSelectedCatalogId(e.pk_catalog_id)}
                  >
                    change best ventral
                  </div>
                )}
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
                  Last Size: {e.last_size_m != null ? `${e.last_size_m.toFixed(2)} m` : "—"}
                </div>
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
      )}

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
