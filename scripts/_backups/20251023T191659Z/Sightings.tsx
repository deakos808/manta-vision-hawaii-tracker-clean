// File: src/pages/browse_data/Sightings.tsx
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import SightingFilterBox from "@/components/sightings/SightingFilterBox";
import MapDialog from "@/components/maps/MapDialog";
import MantasInSightingModal from "@/components/sightings/MantasInSightingModal";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/* ── types ─────────────────────────────────────────── */
interface Sighting {
  pk_sighting_id: number;
  sighting_date: string | null;
  start_time?: string | null;
  end_time?: string | null;
  island?: string | null;
  sitelocation?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  photographer?: string | null;
  organization?: string | null;
  total_mantas?: number | null;
  population?: string | null;
  manta_count?: number | null;
  manta_for_catalog_id?: number | null;
}

const PAGE_SIZE = 50;

export default function Sightings() {
  const [searchParams] = useSearchParams();
  const catalogIdParam = searchParams.get("catalogId");
  const sightingIdParam = searchParams.get("sightingId");

  // quick search & filters
  const [search, setSearch] = useState("");
  const [island, setIsland] = useState("all");
  const [photographer, setPhotographer] = useState("");
  const [location, setLocation] = useState("");
  const [population, setPopulation] = useState("");
  const [minMantas, setMinMantas] = useState<number | "">("");
  const [date, setDate] = useState("");
  const [dateKnown, setDateKnown] = useState(false);
  const [dateUnknown, setDateUnknown] = useState(false);

  // Species (present in FilterBox; list/map parity added in next patch)
  const [species, setSpecies] = useState("");

  // Admin controls
  const [isAdmin, setIsAdmin] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setIsAdmin(false); return; }
        const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
        const role = data?.role ?? null;
        setIsAdmin(role === "admin" || role === "database_manager");
      } catch {}
    })();
  }, []);

  /* ── query + pagination (strict ordering) ───────────────────────── */
  const [sortAsc, setSortAsc] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  // Map & modal state
  const [showMap, setShowMap] = useState(false);
  const [mapPoints, setMapPoints] = useState<{ lat: number; lon: number }[]>([]);
  const [showMantas, setShowMantas] = useState(false);
  const [mantasForSighting, setMantasForSighting] = useState<number | null>(null);

  // Fetch a single page under the current filters
  const fetchSightings = async ({ pageParam = 0 }: { pageParam?: number }) => {
    let q = supabase
      .from("sightings")
      .select(
        "pk_sighting_id,sighting_date,start_time,end_time,island,sitelocation,latitude,longitude,photographer,organization,total_mantas,population"
      )
      .order("pk_sighting_id", { ascending: sortAsc })
      .range(pageParam * PAGE_SIZE, pageParam * PAGE_SIZE + PAGE_SIZE - 1);

    if (island && island !== "all") q = q.ilike("island", `%${island}%`);
    if (photographer) q = q.ilike("photographer", `%${photographer}%`);
    if (location) q = q.eq("sitelocation", location.trim());
    if (population) q = q.ilike("population", `%${population}%`);
    if (minMantas !== "") q = q.gte("total_mantas", Number(minMantas));
    if (dateKnown) q = q.not("sighting_date", "is", null);
    if (dateUnknown) q = q.is("sighting_date", null);
    if (date) q = q.eq("sighting_date", date);

    if (catalogIdParam) {
      const { data: mRows } = await supabase
        .from("mantas")
        .select("fk_sighting_id")
        .eq("fk_catalog_id", Number(catalogIdParam));
      const ids = (mRows ?? []).map((r: any) => r.fk_sighting_id);
      q = ids.length ? q.in("pk_sighting_id", ids) : q.eq("pk_sighting_id", 0);
    }
    if (sightingIdParam) q = q.eq("pk_sighting_id", Number(sightingIdParam));

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as Sighting[];
  };

  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: [
      "sightings",
      {
        island,
        photographer,
        location,
        population,
        minMantas,
        date,
        dateKnown,
        dateUnknown,
        catalogIdParam,
        sightingIdParam,
        sortAsc,
      },
    ],
    queryFn: ({ pageParam }) => fetchSightings({ pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      (lastPage?.length ?? 0) >= PAGE_SIZE ? pages.length : undefined,
  });

  // Flatten pages after the hook
  const sightings = useMemo(() => (data?.pages ?? []).flat(), [data]);

  // IntersectionObserver sentinel
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useCallback(
    (node: HTMLDivElement) => {
      if (isFetchingNextPage) return;
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage) fetchNextPage();
      });
      if (node) observerRef.current.observe(node);
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  );

  // Sort then quick search
  const sortedSightings = useMemo(() => {
    const arr = [...sightings];
    arr.sort((a, b) =>
      sortAsc ? a.pk_sighting_id - b.pk_sighting_id : b.pk_sighting_id - a.pk_sighting_id
    );
    return arr;
  }, [sightings, sortAsc]);

  const lower = search.toLowerCase();
  const quickFiltered = sortedSightings.filter(
    (s) =>
      (s.sitelocation ?? "").toLowerCase().includes(lower) ||
      (s.photographer ?? "").toLowerCase().includes(lower) ||
      (s.organization ?? "").toLowerCase().includes(lower)
  );

  // Map open handler – rebuild points from the current list
  const handleOpenMap = useCallback(() => {
    const pts =
      (quickFiltered ?? [])
        .filter((s) => typeof s.latitude === "number" && typeof s.longitude === "number")
        .map((s) => ({ lat: Number(s.latitude), lon: Number(s.longitude) }));
    setMapPoints(pts);
    setShowMap(true);
  }, [quickFiltered]);

  // Admin-only delete
  const handleDeleteSighting = async (id: number) => {
    if (!isAdmin) return;
    try {
      setDeletingId(id);
      await supabase.from("sightings").delete().eq("pk_sighting_id", id);
      await refetch();
    } finally {
      setDeletingId(null);
    }
  };

  // Accurate total count
  useEffect(() => {
    const getTotal = async () => {
      let q = supabase.from("sightings").select("*", { count: "exact", head: true });
      if (island !== "all") q = q.ilike("island", `%${island}%`);
      if (photographer) q = q.ilike("photographer", `%${photographer}%`);
      if (location) q = q.eq("sitelocation", location.trim());
      if (population) q = q.ilike("population", `%${population}%`);
      if (minMantas !== "") q = q.gte("total_mantas", Number(minMantas));
      if (dateKnown) q = q.not("sighting_date", "is", null);
      if (dateUnknown) q = q.is("sighting_date", null);
      if (date) q = q.eq("sighting_date", date);
      if (catalogIdParam) {
        const { data: mdata } = await supabase
          .from("mantas")
          .select("fk_sighting_id")
          .eq("fk_catalog_id", Number(catalogIdParam));
        const ids = (mdata ?? []).map((r: any) => r.fk_sighting_id);
        q = ids.length ? q.in("pk_sighting_id", ids) : q.eq("pk_sighting_id", 0);
      }
      if (sightingIdParam) q = q.eq("pk_sighting_id", Number(sightingIdParam));
      const { count: totalCountVal } = await q;
      setTotalCount(totalCountVal ?? 0);
    };
    getTotal();
  }, [
    island,
    photographer,
    location,
    population,
    minMantas,
    date,
    dateKnown,
    dateUnknown,
    catalogIdParam,
    sightingIdParam,
  ]);

  // Summary text
  const summary = useMemo(() => {
    const p: string[] = [];
    if (date) p.push(`Date: ${date}`);
    if (population) p.push(`Population: ${population}`);
    if (island !== "all" && island) p.push(`Island: ${island}`);
    if (location) p.push(`Location: ${location}`);
    if (photographer) p.push(`Photographer: ${photographer}`);
    if (minMantas !== "") p.push(`≥ Mantas: ${minMantas}`);
    if (dateKnown) p.push("Date: known");
    if (dateUnknown) p.push("Date: unknown");
    return p.join("; ");
  }, [date, population, island, location, photographer, minMantas, dateKnown, dateUnknown]);

  // Clear filters
  const onClear = () => {
    setSearch("");
    setIsland("all");
    setPhotographer("");
    setLocation("");
    setPopulation("");
    setMinMantas("");
    setDate("");
    setDateKnown(false);
    setDateUnknown(false);
    setSpecies("");
  };

  // Auto-fetch extra pages if the first page doesn't fill the viewport
  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;
    async function maybeFetchMore() {
      await new Promise((r) => setTimeout(r, 50));
      const docH = document.documentElement.scrollHeight;
      const winH = window.innerHeight;
      if (!cancelled && hasNextPage && docH <= winH) {
        await fetchNextPage();
        if (!cancelled) maybeFetchMore();
      }
    }
    maybeFetchMore();
    return () => { cancelled = true; };
  }, [isLoading, hasNextPage, fetchNextPage, quickFiltered.length]);

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 pb-12">
        {/* Optional 'Return to Catalog' link */}
        {catalogIdParam && (
          <div className="mt-2 text-sm">
            <Link to={`/browse/catalog?catalogId=${Number(catalogIdParam)}`} className="text-blue-600 hover:underline">
              ← Return to Catalog {catalogIdParam}
            </Link>
          </div>
        )}

        {/* Hero */}
        <div className="bg-blue-600 text-white py-6 px-4 sm:px-8 lg:px-16 shadow text-center">
          <h1 className="text-4xl font-bold">Sightings</h1>
        </div>

        {/* Filters */}
        <div className="bg-blue-50 px-4 sm:px-8 lg:px-16 py-4 shadow-sm -mt-2">
          <div className="text-sm text-blue-800 mb-2">
            <a href="/browse/data" className="hover:underline">← Return to Browse Data</a>
          </div>
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm font-medium">Filter Sighting Records by:</div>
          </div>

          {/* Left-justified search */}
          <input
            className="mb-3 border rounded px-3 py-2 w-full sm:w-64 text-sm"
            placeholder="Search location, photographer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <SightingFilterBox
            island={island}
            setIsland={setIsland}
            photographer={photographer}
            setPhotographer={setPhotographer}
            location={location}
            setLocation={setLocation}
            population={population}
            setPopulation={setPopulation}
            minMantas={minMantas}
            setMinMantas={setMinMantas}
            date={date}
            setDate={setDate}
            onClear={onClear}
            isAdmin={isAdmin}
            species={species}
            setSpecies={setSpecies}
          />

          {/* Sort row */}
          <div className="flex items-center text-sm text-gray-700 mt-3 gap-2">
            <span>Sort by Sighting&nbsp;ID</span>
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
        </div>

        {/* Summary */}
        <div className="text-sm text-gray-700 mb-4">
          Showing {quickFiltered.length} of {totalCount ?? "…"} total records
          {summary ? `, filtered by ${summary}` : ""}
        </div>

        {/* View Map */}
        <div className="mb-4">
          <Button variant="outline" className="text-blue-600 border-blue-600" onClick={handleOpenMap}>
            View Map
          </Button>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {isLoading && <p>Loading…</p>}
          {!isLoading && quickFiltered.length === 0 && <p>No sightings found.</p>}

          {!isLoading &&
            quickFiltered.map((s) => (
              <Card key={s.pk_sighting_id}>
                <CardContent className="p-4 flex flex-col md:flex-row gap-6">
                  <div className="text-sm space-y-1 md:w-1/2">
                    <p>
                      <strong className="text-blue-600">Date:</strong> {s.sighting_date ?? "unknown"}
                    </p>
                    <p>
                      <strong>Sighting ID:</strong> {s.pk_sighting_id}
                    </p>
                    <p>
                      <strong>Time:</strong> {s.start_time || "—"} – {s.end_time || "—"}
                    </p>
                    <p>
                      <strong>Island:</strong> {s.island || "—"}
                    </p>
                    <p>
                      <strong>Location:</strong> {s.sitelocation || "—"}
                    </p>
                  </div>

                  <div className="text-sm space-y-2 md:w-1/2">
                    {isAdmin && (
                      <div className="flex justify-end md:self-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDeleteSighting(s.pk_sighting_id)}
                          disabled={deletingId === s.pk_sighting_id}
                          title="Delete sighting"
                        >
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      </div>
                    )}
                    <p>
                      <strong>Photographer:</strong> {s.photographer || "—"}
                    </p>
                    <p>
                      <strong>Organization:</strong> {s.organization || "—"}
                    </p>

                    <div className="flex flex-wrap gap-2 mt-1">
                      <Button
                        variant="default"
                        className="text-white bg-blue-600 hover:bg-blue-700"
                        onClick={() => {
                          setMantasForSighting(s.pk_sighting_id);
                          setShowMantas(true);
                        }}
                      >
                        View All Mantas
                        {typeof s.manta_count === "number" ? ` (${s.manta_count})` : ""}
                      </Button>

                      {catalogIdParam && (
                        <Button asChild variant="outline" className="border-blue-600 text-blue-700">
                          <Link
                            to={`/browse/mantas?sightingId=${s.pk_sighting_id}&catalogId=${Number(
                              catalogIdParam
                            )}${s.manta_for_catalog_id ? `#m${s.manta_for_catalog_id}` : ""}`}
                            title={
                              s.manta_for_catalog_id
                                ? `Jump to manta ${s.manta_for_catalog_id}`
                                : "Show only mantas for this catalog (anchor unknown)"
                            }
                          >
                            {`View Catalog ${catalogIdParam} (1)`}
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>

        {/* sentinel for IO */}
        <div ref={loadMoreRef} className="h-10" />

        {/* Fallback 'Load more' button */}
        {hasNextPage && (
          <div className="mt-2 flex justify-center">
            <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}

        {/* Map dialog */}
        <MapDialog open={showMap} onOpenChange={setShowMap} points={mapPoints} />

        {/* Mantas-in-sighting modal */}
        <MantasInSightingModal open={showMantas} onOpenChange={setShowMantas} sightingId={mantasForSighting} />
      </div>
    </Layout>
  );
}
