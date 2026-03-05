import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { deleteManta } from "@/lib/adminApi";
import Layout from "@/components/layout/Layout";
import BackToTopButton from "@/components/browse/BackToTopButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import MantaFilterBox from "@/components/mantas/MantaFilterBox";
import MantaPhotosModal from "@/components/mantas/MantaPhotosModal";
import MantaPhotosViewer from "@/components/mantas/MantaPhotosViewer";

import { useIsAdmin } from "@/lib/isAdmin";
type MantaRow = {
  pk_manta_id: number;
  fk_catalog_id: number;
  fk_sighting_id: number;
  name: string | null;
  population: string | null;
  island: string | null;
  location: string | null;
  photographer: string | null;
  photo_count?: number;
  best_thumb_url?: string | null;
};

type MantaFacetRow = {
  population: string | null;
  island: string | null;
  location: string | null;
  photographer: string | null;
};

const PAGE = 500;

export default function MantasPage() {
  const isAdmin = useIsAdmin();
  const [searchParams] = useSearchParams();

  // Optional scoping context from the URL
  const sightingIdParam = searchParams.get("sightingId");
  const crumbIdParam =
    searchParams.get("crumbCatalogId") ?? searchParams.get("catalogId");

  const sightingId = sightingIdParam ? Number(sightingIdParam) : undefined;
  const crumbCatalogId = crumbIdParam ? Number(crumbIdParam) : undefined;

  // Data
  const [allMantas, setAllMantas] = useState<MantaRow[]>([]);
  const [photoCounts, setPhotoCounts] = useState<Record<number, number>>({});
  const [facetRows, setFacetRows] = useState<MantaFacetRow[]>([]);
  const [totalMantas, setTotalMantas] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Search + Filters
  const [q, setQ] = useState("");
  const [population, setPopulation] = useState<string[]>([]);
  const [island, setIsland] = useState<string[]>([]);
  const [location, setLocation] = useState<string[]>([]);
  const [photographer, setPhotographer] = useState<string[]>([]);

  // Sort: false = newest first (desc), true = oldest first (asc)
  const [sortAsc, setSortAsc] = useState(false);
  const CARD_PAGE = 36;
  const [showing, setShowing] = useState(CARD_PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [serverFrom, setServerFrom] = useState(0);
  const handleClearFilters = () => {
    setPopulation([]);
    setIsland([]);
    setLocation([]);
    setPhotographer([]);
    setQ("");
    setShowing(CARD_PAGE);
    setServerFrom(0);
  };

  // Reset when context changes
  useEffect(() => {
    handleClearFilters();
  }, [sightingId, crumbCatalogId]);
  // Load mantas (server-paged), join catalog/sightings for metadata, get best thumbs
  useEffect(() => {
    let active = true;

    async function fetchTotal() {
      const { count } = await supabase
        .from("mantas")
        .select("*", { count: "exact", head: true });
      if (!active) return;
      setTotalMantas(count ?? 0);
    }

    async function enrichAndAppend(rows: any[], replace: boolean) {
      const mantas: MantaRow[] = [];
      const mantaIds: number[] = [];
      const facets: MantaFacetRow[] = [];

      for (const r of rows) {
        const photog = r.sightings?.photographer ?? r.photographer ?? null;
        const m: MantaRow = {
          pk_manta_id: r.pk_manta_id,
          fk_catalog_id: r.fk_catalog_id,
          fk_sighting_id: r.fk_sighting_id,
          name: r.catalog?.name ?? null,
          population: r.sightings?.population ?? null,
          island: r.sightings?.island ?? null,
          location: r.sightings?.sitelocation ?? null,
          photographer: photog,
          photo_count: undefined,
          best_thumb_url: null,
        };
        mantas.push(m);
        mantaIds.push(m.pk_manta_id);
        facets.push({
          population: m.population,
          island: m.island,
          location: m.location,
          photographer: m.photographer,
        });
      }

      if (!active) return;

      // Photo counts (page only)
      try {
        if (mantaIds.length) {
          const { data: crows } = await supabase
            .from("manta_photo_counts")
            .select("fk_manta_id, photos_count")
            .in("fk_manta_id", mantaIds);

          const countsByManta = new Map<number, number>();
          for (const r of (crows ?? [])) {
            if (typeof (r as any).fk_manta_id === "number") {
              countsByManta.set((r as any).fk_manta_id, ((r as any).photos_count as number) ?? 0);
            }
          }
          for (const m of mantas) {
            const n = countsByManta.get(m.pk_manta_id);
            if (typeof n === "number") m.photo_count = n;
          }
        }
      } catch (e: any) {
        console.warn("[Mantas] count fetch failed", (e && e.message) || e);
      }

      // Best-ventral thumbnails (page only)
      try {
        if (mantaIds.length) {
          const bestByManta = new Map<number, number>();
          const thumbByPhotoId = new Map<number, string | null>();

          const { data: bestRows } = await supabase
            .from("photos")
            .select("pk_photo_id,fk_manta_id")
            .eq("is_best_manta_ventral_photo", true)
            .in("fk_manta_id", mantaIds);

          const bestIds = (bestRows ?? [])
            .map((r: any) => {
              if (r.fk_manta_id && r.pk_photo_id) {
                bestByManta.set(r.fk_manta_id, r.pk_photo_id);
                return r.pk_photo_id as number;
              }
              return undefined;
            })
            .filter(Boolean) as number[];

          for (let i = 0; i < bestIds.length; i += 1000) {
            const chunk = bestIds.slice(i, i + 1000);
            const { data: trs } = await supabase
              .from("photos_with_photo_view")
              .select("pk_photo_id, thumbnail_url")
              .in("pk_photo_id", chunk);
            for (const tr of trs ?? []) {
              thumbByPhotoId.set((tr as any).pk_photo_id, (tr as any).thumbnail_url ?? null);
            }
          }

          for (const m of mantas) {
            const bestId = bestByManta.get(m.pk_manta_id);
            if (bestId) m.best_thumb_url = thumbByPhotoId.get(bestId) ?? null;
          }
        }
      } catch (e: any) {
        console.warn("[Mantas] thumb fetch failed", (e && e.message) || e);
      }

      if (!active) return;

      setAllMantas((prev) => (replace ? mantas : [...prev, ...mantas]));
      setFacetRows((prev) => (replace ? facets : [...prev, ...facets]));
    }

    const fetchPage = async (from: number, replace: boolean) => {
      setError(null);
      setLoadingMore(true);

      let q = supabase
        .from("mantas")
        .select(
          [
            "pk_manta_id",
            "fk_catalog_id",
            "fk_sighting_id",
            "photographer",
            "catalog:fk_catalog_id ( name )",
            "sightings:fk_sighting_id ( population, island, sitelocation, photographer )",
          ].join(",")
        )
        .range(from, from + PAGE - 1);

      if (sightingId) q = q.eq("fk_sighting_id", sightingId);
      if (crumbCatalogId) q = q.eq("fk_catalog_id", crumbCatalogId);

      const { data, error } = await q;
      if (!active) return;

      if (error) {
        setError(error.message);
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const rows = (data ?? []) as any[];
      await enrichAndAppend(rows, replace);

      if (!active) return;

      if (rows.length < PAGE) {
        setHasMore(false);
      } else {
        setHasMore(true);
        setServerFrom(from + PAGE);
      }

      setLoading(false);
      setLoadingMore(false);
    };

    const init = async () => {
      setLoading(true);
      setHasMore(true);
      setServerFrom(0);
      setAllMantas([]);
      setFacetRows([]);
      await fetchPage(0, true);
    };

    fetchTotal();
    init();

    return () => {
      active = false;
    };
  }, [sightingId, crumbCatalogId]);

  // Client-side search & filters
  const filteredMantas = useMemo(() => {
    const query = q.trim().toLowerCase();

    return allMantas.filter((m) => {
      const popOk = population.length === 0 || (m.population && population.includes(m.population));
      const islOk = island.length === 0 || (m.island && island.includes(m.island));
      const locOk = location.length === 0 || (m.location && location.includes(m.location));
      const phoOk = photographer.length === 0 || (m.photographer && photographer.includes(m.photographer));
      if (!(popOk && islOk && locOk && phoOk)) return false;

      if (!query) return true;
      if (/^\d+$/.test(query)) {
        const id = Number(query);
        return m.pk_manta_id === id || m.fk_catalog_id === id;
        }
      return (
        (m.name ?? "").toLowerCase().includes(query) ||
        (m.location ?? "").toLowerCase().includes(query) ||
        (m.photographer ?? "").toLowerCase().includes(query)
      );
    });
  }, [allMantas, q, population, island, location, photographer]);

  // Sort AFTER filters
  const sortedMantas = useMemo(() => {
    const arr = [...filteredMantas];
    arr.sort((a, b) =>
      sortAsc ? a.pk_manta_id - b.pk_manta_id : b.pk_manta_id - a.pk_manta_id
    );
    return arr;
  }, [filteredMantas, sortAsc]);

  const visibleMantas = useMemo(
    () => sortedMantas.slice(0, showing),
    [sortedMantas, showing]
  );

  // Human-readable active filters string
  const activeFiltersText = useMemo(() => {
    const parts: string[] = [];
    if (q.trim()) parts.push(`Search: "${q.trim()}"`);
    if (population.length) parts.push(`Population: ${population.join(", ")}`);
    if (island.length) parts.push(`Island: ${island.join(", ")}`);
    if (location.length) parts.push(`Location: ${location.join(", ")}`);
    if (photographer.length) parts.push(`Photographer: ${photographer.join(", ")}`);
    return parts.join(" · ");
  }, [q, population, island, location, photographer]);

  // Infinite scroll:
  // 1) increases visible slice (UI paging)
  // 2) triggers server pagination when nearing the end of loaded data
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (loadingMore) return;

        setShowing((n) => Math.min(n + CARD_PAGE, sortedMantas.length));

        if (loading) return;

        const remaining = sortedMantas.length - showing;
        if (hasMore && remaining <= CARD_PAGE) {
          setLoadingMore(true);
          (async () => {
            let q = supabase
              .from("mantas")
              .select(
                [
                  "pk_manta_id",
                  "fk_catalog_id",
                  "fk_sighting_id",
                  "photographer",
                  "catalog:fk_catalog_id ( name )",
                  "sightings:fk_sighting_id ( population, island, sitelocation, photographer )",
                ].join(",")
              )
              .range(serverFrom, serverFrom + PAGE - 1);

            if (sightingId) q = q.eq("fk_sighting_id", sightingId);
            if (crumbCatalogId) q = q.eq("fk_catalog_id", crumbCatalogId);

            const { data, error } = await q;
            if (error) {
              setError(error.message);
              setLoadingMore(false);
              return;
            }

            const rows = (data ?? []) as any[];
            if (rows.length === 0) {
              setHasMore(false);
              setLoadingMore(false);
              return;
            }

            const mantas: MantaRow[] = [];
            const mantaIds: number[] = [];
            const facets: MantaFacetRow[] = [];

            for (const r of rows) {
              const photog = (r as any).sightings?.photographer ?? (r as any).photographer ?? null;
              const m: MantaRow = {
                pk_manta_id: (r as any).pk_manta_id,
                fk_catalog_id: (r as any).fk_catalog_id,
                fk_sighting_id: (r as any).fk_sighting_id,
                name: (r as any).catalog?.name ?? null,
                population: (r as any).sightings?.population ?? null,
                island: (r as any).sightings?.island ?? null,
                location: (r as any).sightings?.sitelocation ?? null,
                photographer: photog,
                photo_count: undefined,
                best_thumb_url: null,
              };
              mantas.push(m);
              mantaIds.push(m.pk_manta_id);
              facets.push({
                population: m.population,
                island: m.island,
                location: m.location,
                photographer: m.photographer,
              });
            }

            try {
              if (mantaIds.length) {
                const { data: crows } = await supabase
                  .from("manta_photo_counts")
                  .select("fk_manta_id, photos_count")
                  .in("fk_manta_id", mantaIds);

                const countsByManta = new Map<number, number>();
                for (const r of (crows ?? [])) {
                  if (typeof (r as any).fk_manta_id === "number") {
                    countsByManta.set((r as any).fk_manta_id, ((r as any).photos_count as number) ?? 0);
                  }
                }
                for (const m of mantas) {
                  const n = countsByManta.get(m.pk_manta_id);
                  if (typeof n === "number") m.photo_count = n;
                }
              }
            } catch (e: any) {
              console.warn("[Mantas] count fetch failed", (e && e.message) || e);
            }

            try {
              if (mantaIds.length) {
                const bestByManta = new Map<number, number>();
                const thumbByPhotoId = new Map<number, string | null>();

                const { data: bestRows } = await supabase
                  .from("photos")
                  .select("pk_photo_id,fk_manta_id")
                  .eq("is_best_manta_ventral_photo", true)
                  .in("fk_manta_id", mantaIds);

                const bestIds = (bestRows ?? [])
                  .map((r: any) => {
                    if (r.fk_manta_id && r.pk_photo_id) {
                      bestByManta.set(r.fk_manta_id, r.pk_photo_id);
                      return r.pk_photo_id as number;
                    }
                    return undefined;
                  })
                  .filter(Boolean) as number[];

                for (let i = 0; i < bestIds.length; i += 1000) {
                  const chunk = bestIds.slice(i, i + 1000);
                  const { data: trs } = await supabase
                    .from("photos_with_photo_view")
                    .select("pk_photo_id, thumbnail_url")
                    .in("pk_photo_id", chunk);
                  for (const tr of trs ?? []) {
                    thumbByPhotoId.set((tr as any).pk_photo_id, (tr as any).thumbnail_url ?? null);
                  }
                }

                for (const m of mantas) {
                  const bestId = bestByManta.get(m.pk_manta_id);
                  if (bestId) m.best_thumb_url = thumbByPhotoId.get(bestId) ?? null;
                }
              }
            } catch (e: any) {
              console.warn("[Mantas] thumb fetch failed", (e && e.message) || e);
            }

            setAllMantas((prev) => [...prev, ...mantas]);
            setFacetRows((prev) => [...prev, ...facets]);

            if (rows.length < PAGE) {
              setHasMore(false);
            } else {
              setHasMore(true);
              setServerFrom((n) => n + PAGE);
            }

            setLoadingMore(false);
          })();
        }
      },
      { root: null, rootMargin: "800px", threshold: 0 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [showing, sortedMantas.length, loadingMore, hasMore, serverFrom, sightingId, crumbCatalogId]);
  const headerSubtitle = useMemo(() => {
    let base = "";
    if (sightingId) {
      const n = filteredMantas.length;
      base = `${n} record${n === 1 ? "" : "s"} for Sighting ${sightingId}${
        crumbCatalogId ? ` (Catalog ${crumbCatalogId})` : ""
      }`;
    } else {
      base = `${filteredMantas.length} record${filteredMantas.length === 1 ? "" : "s"} showing of ${totalMantas} total`;
    }
    if (activeFiltersText) base += ` — filtered by ${activeFiltersText}`;
    return base;
  }, [filteredMantas.length, sightingId, crumbCatalogId, totalMantas, activeFiltersText]);

  // Breadcrumb + optional "Return to Sighting" builder
  const sightingsBackHref = useMemo(() => {
    if (!sightingId) return "";
    const params = new URLSearchParams({ sightingId: String(sightingId) });
    if (crumbCatalogId) params.set("catalogId", String(crumbCatalogId));
    return `/browse/sightings?${params.toString()}`;
  }, [sightingId, crumbCatalogId]);

  // Photos modal
  const [showPhotos, setShowPhotos] = useState(false);
  const [photosFor, setPhotosFor] = useState<{ mantaId: number; sightingId?: number } | null>(null);

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 pb-12">
{/* Optional return-to-sighting link (preserves catalogId) */}
        {sightingId && (
          <div className="mt-2 text-sm">
            <Link to={sightingsBackHref} className="text-blue-600 hover:underline">
              ← Return to Sighting {sightingId}
            </Link>
          </div>
        )}

        {/* Hero (full-width, Catalog style) */}
        <div className="bg-blue-600 text-white py-6 px-4 sm:px-8 lg:px-16 shadow text-center">
          <h1 className="text-4xl font-bold">Mantas</h1>
        </div>

        {/* Search + Filters (Catalog style light-blue block) */}
        <div className="bg-blue-50 px-4 sm:px-8 lg:px-16 py-4 shadow-sm -mt-2">
          {/* Breadcrumb-like link (left-justified) */}
          <div className="text-sm text-blue-800 mb-2">
            <a href="/browse/data" className="hover:underline">← Return to Browse Data</a>
          </div>

          {/* Left-justified search */}
          <div>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or ID…"
              aria-label="Search mantas"
              className="max-w-md mb-3 bg-white"
            />
          </div>

          
          <MantaFilterBox rows={facetRows}
              population={population}
              setPopulation={setPopulation}
              island={island}
              setIsland={setIsland}
              location={location}
              setLocation={setLocation}
              photographer={photographer}
              setPhotographer={setPhotographer}
              onClear={handleClearFilters} />


          {/* Sort row (Catalog style) */}
          <div className="flex items-center text-sm text-gray-700 mt-1 gap-2">
            <span>Sort by Manta&nbsp;ID</span>
            <Button
              size="icon"
              variant="ghost"
              className={sortAsc ? "" : "text-blue-600"}
              onClick={() => setSortAsc(false)}
              title="Newest first"
            >
              ▲
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className={sortAsc ? "text-blue-600" : ""}
              onClick={() => setSortAsc(true)}
              title="Oldest first"
            >
              ▼
            </Button>
          </div>

          {/* Summary below */}
        </div>

        <div className="text-sm text-gray-700 mb-4">{headerSubtitle}</div>

        {/* Results */}
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-6">
          {loading && (
            <div className="rounded-xl border bg-white p-6 text-sm text-muted-foreground shadow-sm">
              Loading mantas…
            </div>
          )}

          {error && (
            <div className="rounded-xl border bg-white p-6 text-sm text-red-600 shadow-sm">
              {error}
            </div>
          )}

          {!loading && !error && filteredMantas.length === 0 && (
            <div className="rounded-xl border bg-white p-6 text-sm text-muted-foreground shadow-sm">
              No mantas found{sightingId ? " for this sighting." : "."}
            </div>
          )}

          {!loading &&
            !error &&
            visibleMantas.map((m) => {
                const photoCount = photoCounts[m.pk_manta_id as number] ?? null;
              return (
                <div
                  id={`m${m.pk_manta_id}`}
                  key={m.pk_manta_id}
                  className="flex flex-col rounded border bg-white p-2 shadow-sm"
                >
                  <div className="w-full overflow-hidden rounded-lg border bg-gray-50">
                    <img
                      src={m.best_thumb_url || "/manta-logo.svg"}
                      alt={m.name ?? `Manta ${m.pk_manta_id}`}
                      className="w-full h-[140px] object-cover rounded"
                      onError={(e) =>
                        ((e.target as HTMLImageElement).src = "/manta-logo.svg")
                      }
                    />
                  </div>

                  <div className="flex-1">
                    <div className="grid gap-1 text-xs">
                      <div className="font-semibold text-sky-700">
                        {m.name ?? `Manta — ${m.pk_manta_id}`}
                      </div>

                      <div className="grid grid-cols-1 gap-1 text-xs">
                        <div>
                          <span className="text-muted-foreground">Catalog ID:</span> {m.fk_catalog_id}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Manta ID:</span> {m.pk_manta_id}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Sighting ID:</span> {m.fk_sighting_id}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-1 text-xs">
                        <div>
                          <span className="text-muted-foreground">Population:</span>{" "}
                          {m.population ?? "—"}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Island:</span> {m.island ?? "—"}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Location:</span>{" "}
                          {m.location ?? "—"}
                        </div>
                      </div>

                      <div>
                        <span className="text-muted-foreground">Photographer:</span>{" "}
                        {m.photographer ?? "—"}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
      {isAdmin && (
        <button
          className="text-red-600 text-xs underline flex items-center gap-1"
          title="Delete manta and photos"
          onClick={async () => {
            if (!confirm("Are you sure you want to delete this manta and associated photos?")) return;
            try { await deleteManta(m.pk_manta_id); window.location.reload(); }
            catch (e) { alert('Delete failed: ' + (e?.message || e)); }
          }}
        >
          <Trash2 className="h-4 w-4" /></button>
      )}
                      <Button
                        onClick={() => {
                          setPhotosFor({ mantaId: m.pk_manta_id, sightingId });
                          setShowPhotos(true);
                        }}
                      >
                        View All Photos
                        {typeof m.photo_count === "number" ? ` (${m.photo_count})` : ""}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {loadingMore && (
        <div className="flex justify-center py-6">
          <div className="h-7 w-7 rounded-full border-4 border-gray-300 border-t-blue-600 animate-spin" aria-label="Loading more" />
        </div>
      )}
      <div ref={loadMoreRef} className="h-10" />

      <BackToTopButton />


      {/* Photos modal */}
      <MantaPhotosViewer open={showPhotos} onOpenChange={setShowPhotos} mantaId={photosFor?.mantaId ?? null}  onCount={(id,n)=>setPhotoCounts(c=>({...c,[id]:n}))} />
    </Layout>
  );
}
