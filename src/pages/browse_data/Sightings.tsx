import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import SightingFilterBox from "@/components/sightings/SightingFilterBox";
import MapDialog from "@/components/maps/MapDialog";
import AllMantasInSightingModal from "@/pages/browse_data/components/AllMantasInSightingModal";

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
  linked_manta_count?: number | null;
  population?: string | null;
  manta_count?: number | null;
  manta_for_catalog_id?: number | null;
}

const PAGE_SIZE = 50;

async function fetchNamePrefixSightingIds(namePrefix: string): Promise<Set<number>> {
  const ids = new Set<number>();
  const prefix = namePrefix.trim();
  if (!prefix) return ids;

  const pageSz = 1000;
  const catalogIds: number[] = [];

  for (let from = 0; from < 200000; from += pageSz) {
    const { data, error } = await supabase
      .from("catalog")
      .select("pk_catalog_id,name")
      .ilike("name", `${prefix}%`)
      .range(from, from + pageSz - 1);

    if (error) break;

    const chunk: any[] = data || [];
    for (const r of chunk) {
      const id = Number((r as any)?.pk_catalog_id || 0);
      if (id) catalogIds.push(id);
    }
    if (chunk.length < pageSz) break;
  }

  if (catalogIds.length === 0) return ids;

  const CH = 800;
  for (let i = 0; i < catalogIds.length; i += CH) {
    const slice = catalogIds.slice(i, i + CH);
    const { data, error } = await supabase
      .from("mantas")
      .select("fk_sighting_id")
      .in("fk_catalog_id", slice);

    if (error) continue;

    const rows: any[] = data || [];
    for (const r of rows) {
      const sid = Number((r as any)?.fk_sighting_id || 0);
      if (sid) ids.add(sid);
    }
  }

  return ids;
}

async function fetchSpeciesSightingIds(species: string): Promise<Set<number>> {
  const ids = new Set<number>();
  if (!species) return ids;

  const pageSz = 1000;
  const catalogIds: number[] = [];

  for (let from = 0; from < 200000; from += pageSz) {
    const { data, error } = await supabase
      .from("catalog")
      .select("pk_catalog_id")
      .ilike("species", "%" + species + "%")
      .range(from, from + pageSz - 1);

    if (error) break;

    const chunk: any[] = data || [];
    for (const r of chunk) {
      const id = Number((r as any)?.pk_catalog_id || 0);
      if (id) catalogIds.push(id);
    }
    if (chunk.length < pageSz) break;
  }

  if (catalogIds.length === 0) return ids;

  const CH = 800;
  for (let i = 0; i < catalogIds.length; i += CH) {
    const slice = catalogIds.slice(i, i + CH);
    const { data } = await supabase
      .from("mantas")
      .select("fk_sighting_id")
      .in("fk_catalog_id", slice);

    const rows: any[] = data || [];
    for (const r of rows) {
      const sid = Number((r as any)?.fk_sighting_id || 0);
      if (sid) ids.add(sid);
    }
  }

  return ids;
}

async function fetchSightingIdPrefixIds(prefix: string): Promise<Set<number> | null> {
  const needle = prefix.trim();
  if (!needle) return null;

  const ids = new Set<number>();
  const pageSz = 1000;

  for (let from = 0; from < 500000; from += pageSz) {
    const { data, error } = await supabase
      .from("sightings")
      .select("pk_sighting_id")
      .order("pk_sighting_id", { ascending: true })
      .range(from, from + pageSz - 1);

    if (error) break;

    const chunk: any[] = data || [];
    for (const row of chunk) {
      const sid = Number((row as any)?.pk_sighting_id || 0);
            if (sid && String(sid).startsWith(needle)) ids.add(sid);
    }

    if (chunk.length < pageSz) break;
  }

  return ids;
}

async function fetchCatalogMatchedSightingIds(catalogIdPrefix: string, namePrefix: string): Promise<Set<number> | null> {
  const catalogPrefix = catalogIdPrefix.trim();
  const trimmedName = namePrefix.trim();

  if (!catalogPrefix && !trimmedName) return null;

  if (!catalogPrefix && trimmedName) {
    return fetchNamePrefixSightingIds(trimmedName);
  }

  const nameIdSet = trimmedName
    ? await fetchNamePrefixSightingIds(trimmedName)
    : null;

  const ids = new Set<number>();
  const pageSz = 1000;

  for (let from = 0; from < 500000; from += pageSz) {
    const { data: mantaRows, error: mantaErr } = await supabase
      .from("mantas")
      .select("fk_sighting_id,fk_catalog_id")
      .range(from, from + pageSz - 1);

    if (mantaErr) {
      throw new Error(mantaErr.message);
    }

    const chunk: any[] = mantaRows || [];

    for (const row of chunk) {
      const sid = Number((row as any)?.fk_sighting_id || 0);
      const fkCatalogId = String((row as any)?.fk_catalog_id ?? "");

      if (!sid) continue;

      const catalogOk = !catalogPrefix ? true : fkCatalogId.startsWith(catalogPrefix);
      const nameOk = !nameIdSet ? true : nameIdSet.has(sid);

      if (catalogOk && nameOk) {
        ids.add(sid);
      }
    }

    if (chunk.length < pageSz) break;
  }

  return ids;
}

function intersectIdSets(a: Set<number> | null, b: Set<number> | null): Set<number> | null {
  if (!a && !b) return null;
  if (!a) return b ? new Set(b) : null;
  if (!b) return a ? new Set(a) : null;

  const out = new Set<number>();
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;

  for (const id of smaller) {
    if (larger.has(id)) out.add(id);
  }

  return out;
}

export default function Sightings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCatalogParam = searchParams.get("catalogId");
  const initialSightingParam = searchParams.get("sightingId");

  const [search, setSearch] = useState("");
  const [island, setIsland] = useState("all");
  const [photographer, setPhotographer] = useState("");
  const [location, setLocation] = useState("");
  const [population, setPopulation] = useState("");
  const [minMantas, setMinMantas] = useState<number | "">("");
  const [date, setDate] = useState("");
  const [dateKnown, setDateKnown] = useState(false);
  const [dateUnknown, setDateUnknown] = useState(false);

  const [species, setSpecies] = useState("");
  const [speciesIds, setSpeciesIds] = useState<Set<number> | null>(null);
  const [speciesReady, setSpeciesReady] = useState(true);

  const [sightingIdPrefix, setSightingIdPrefix] = useState("");
  const [catalogIdPrefix, setCatalogIdPrefix] = useState("");
  const [namePrefix, setNamePrefix] = useState("");
  const [catalogMatchIds, setCatalogMatchIds] = useState<Set<number> | null>(null);
  const [catalogMatchReady, setCatalogMatchReady] = useState(true);
  const [sightingIdPrefixIds, setSightingIdPrefixIds] = useState<Set<number> | null>(null);
  const [sightingIdPrefixReady, setSightingIdPrefixReady] = useState(true);

  const [mprf, setMprf] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const [showMap, setShowMap] = useState(false);
  const [mapPoints, setMapPoints] = useState<Array<{ id: number; lat: number; lon: number }>>([]);
  const [showMantas, setShowMantas] = useState(false);
  const [mantasForSighting, setMantasForSighting] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
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

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!species.trim()) {
        if (alive) {
          setSpeciesIds(null);
          setSpeciesReady(true);
        }
        return;
      }

      if (alive) setSpeciesReady(false);

      try {
        const ids = await fetchSpeciesSightingIds(species);
        if (alive) {
          setSpeciesIds(ids);
          setSpeciesReady(true);
        }
      } catch (err) {
        console.error("[Sightings] species helper error:", err);
        if (alive) {
          setSpeciesIds(new Set());
          setSpeciesReady(true);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [species]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!sightingIdPrefix.trim()) {
        if (alive) {
          setSightingIdPrefixIds(null);
          setSightingIdPrefixReady(true);
        }
        return;
      }

      if (alive) setSightingIdPrefixReady(false);

      try {
        const ids = await fetchSightingIdPrefixIds(sightingIdPrefix);
        if (alive) {
          setSightingIdPrefixIds(ids ?? new Set<number>());
          setSightingIdPrefixReady(true);
        }
      } catch (err) {
        console.error("[Sightings] sighting id prefix helper error:", err);
        if (alive) {
          setSightingIdPrefixIds(new Set<number>());
          setSightingIdPrefixReady(true);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [sightingIdPrefix]);

  useEffect(() => {
    let alive = true;

    (async () => {
      const hasCatalogFilter = catalogIdPrefix.trim() !== "" || namePrefix.trim() !== "";

      if (!hasCatalogFilter) {
        if (alive) {
          setCatalogMatchIds(null);
          setCatalogMatchReady(true);
        }
        return;
      }

      if (alive) setCatalogMatchReady(false);

      try {
        const ids = await fetchCatalogMatchedSightingIds(catalogIdPrefix, namePrefix);
        if (alive) {
          setCatalogMatchIds(ids ?? new Set<number>());
          setCatalogMatchReady(true);
        }
      } catch (err) {
        console.error("[Sightings] catalog/name helper error:", err);
        if (alive) {
          setCatalogMatchIds(new Set<number>());
          setCatalogMatchReady(true);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [catalogIdPrefix, namePrefix]);

  useEffect(() => {
    if (!initialSightingParam) return;

    const hasActiveFilter =
      island !== "all" ||
      photographer.trim() !== "" ||
      location.trim() !== "" ||
      population.trim() !== "" ||
      minMantas !== "" ||
      date.trim() !== "" ||
      dateKnown ||
      dateUnknown ||
      species.trim() !== "" ||
      sightingIdPrefix.trim() !== "" ||
      catalogIdPrefix.trim() !== "" ||
      namePrefix.trim() !== "" ||
      mprf.trim() !== "";

    if (!hasActiveFilter) return;

    const sp = new URLSearchParams(searchParams);
    sp.delete("sightingId");
    setSearchParams(sp, { replace: true });
  }, [
    initialSightingParam,
    island,
    photographer,
    location,
    population,
    minMantas,
    date,
    dateKnown,
    dateUnknown,
    species,
    sightingIdPrefix,
    catalogIdPrefix,
    namePrefix,
    mprf,
    searchParams,
    setSearchParams,
  ]);

  const helperFiltersReady = catalogMatchReady && speciesReady && sightingIdPrefixReady;

  const canonicalFilteredIds = useMemo(() => {
    return intersectIdSets(intersectIdSets(catalogMatchIds, speciesIds), sightingIdPrefixIds);
  }, [catalogMatchIds, speciesIds, sightingIdPrefixIds]);

  const fetchSightings = async ({ pageParam = 0 }: { pageParam?: number }) => {
    let q = supabase
      .from("sightings")
      .select("pk_sighting_id,sighting_date,start_time,end_time,island,sitelocation,latitude,longitude,photographer,organization,total_mantas,population")
      .order("pk_sighting_id", { ascending: sortAsc })
      .range(pageParam * PAGE_SIZE, pageParam * PAGE_SIZE + PAGE_SIZE - 1);

    if (island && island !== "all") q = q.ilike("island", "%" + island + "%");
    if (photographer) q = q.ilike("photographer", "%" + photographer + "%");
    if (location) q = q.eq("sitelocation", location.trim());
    if (population) q = q.ilike("population", "%" + population + "%");
    if (mprf === "MPRF") q = q.eq("is_mprf", true);
    if (mprf === "HAMER") q = q.or("is_mprf.is.false,is_mprf.is.null");
    if (minMantas !== "") q = q.gte("total_mantas", Number(minMantas));
    if (dateKnown) q = q.not("sighting_date", "is", null);
    if (dateUnknown) q = q.is("sighting_date", null);
    if (date) q = q.eq("sighting_date", date);

    if (initialCatalogParam) {
      const { data: mRows } = await supabase
        .from("mantas")
        .select("fk_sighting_id")
        .eq("fk_catalog_id", Number(initialCatalogParam));
      const ids = (mRows || []).map((r: any) => Number(r.fk_sighting_id)).filter(Boolean);
      q = ids.length ? q.in("pk_sighting_id", ids) : q.eq("pk_sighting_id", 0);
    }

    if (initialSightingParam) {
      q = q.eq("pk_sighting_id", Number(initialSightingParam));
    }

    if (canonicalFilteredIds !== null) {
      const ids = Array.from(canonicalFilteredIds);
      q = ids.length ? q.in("pk_sighting_id", ids) : q.eq("pk_sighting_id", 0);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const sightingsPage = (data || []) as Sighting[];
    const sightingIds = sightingsPage.map((s) => s.pk_sighting_id).filter(Boolean);

    if (sightingIds.length === 0) {
      return sightingsPage;
    }

    const { data: mantaLinks, error: mantaLinksError } = await supabase
      .from("mantas")
      .select("fk_sighting_id")
      .in("fk_sighting_id", sightingIds);

    if (mantaLinksError) {
      console.error("[Sightings] linked manta count error:", mantaLinksError);
      return sightingsPage.map((s) => ({ ...s, linked_manta_count: 0 }));
    }

    const linkedCountMap = new Map<number, number>();
    for (const row of mantaLinks || []) {
      const sid = Number((row as any)?.fk_sighting_id || 0);
      if (!sid) continue;
      linkedCountMap.set(sid, (linkedCountMap.get(sid) || 0) + 1);
    }

    return sightingsPage.map((s) => ({
      ...s,
      linked_manta_count: linkedCountMap.get(s.pk_sighting_id) ?? 0,
    }));
  };

  const query = useInfiniteQuery({
    queryKey: [
      "sightings",
      {
        island,
        photographer,
        location,
        population,
        sightingIdPrefix,
        catalogIdPrefix,
        namePrefix,
        species,
        mprf,
        minMantas,
        date,
        dateKnown,
        dateUnknown,
        initialCatalogParam,
        initialSightingParam,
        sortAsc,
        helperFiltersReady,
      },
    ],
    queryFn: ({ pageParam }) => fetchSightings({ pageParam }),
    enabled: helperFiltersReady,
    initialPageParam: 0,
    getNextPageParam: (last, pages) => ((last?.length || 0) >= PAGE_SIZE ? pages.length : undefined),
  });

  const sightings = useMemo(() => (query.data?.pages || []).flat() as Sighting[], [query.data]);

  const list = useMemo(() => {
    const needle = (search || "").trim().toLowerCase();
    const arr = [...sightings];

    if (!needle) {
      arr.sort((a, b) => (sortAsc ? a.pk_sighting_id - b.pk_sighting_id : b.pk_sighting_id - a.pk_sighting_id));
      return arr;
    }

    const isNum = /^\d+$/.test(needle);
    const filtered = arr.filter((s) => {
      const text = ((s.sitelocation || "") + " " + (s.photographer || "") + " " + (s.organization || "")).toLowerCase();
      const idOK = isNum ? String(s.pk_sighting_id).includes(needle) : false;
      return isNum ? (idOK || text.includes(needle)) : text.includes(needle);
    });

    filtered.sort((a, b) => (sortAsc ? a.pk_sighting_id - b.pk_sighting_id : b.pk_sighting_id - a.pk_sighting_id));
    return filtered;
  }, [sightings, search, sortAsc]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useCallback((node: HTMLDivElement) => {
    if (query.isFetchingNextPage) return;
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && query.hasNextPage) query.fetchNextPage();
    });
    if (node) observerRef.current.observe(node);
  }, [query.isFetchingNextPage, query.hasNextPage, query.fetchNextPage]);

  useEffect(() => {
    if (!helperFiltersReady) {
      setTotalCount(null);
      return;
    }

    let mounted = true;

    (async () => {
      let q: any = supabase.from("sightings").select("*", { count: "exact", head: true });

      if (island && island !== "all") q = q.ilike("island", "%" + island + "%");
      if (photographer) q = q.ilike("photographer", "%" + photographer + "%");
      if (location) q = q.eq("sitelocation", location.trim());
      if (population) q = q.ilike("population", "%" + population + "%");
      if (mprf === "MPRF") q = q.eq("is_mprf", true);
      if (mprf === "HAMER") q = q.or("is_mprf.is.false,is_mprf.is.null");
      if (minMantas !== "") q = q.gte("total_mantas", Number(minMantas));
      if (dateKnown) q = q.not("sighting_date", "is", null);
      if (dateUnknown) q = q.is("sighting_date", null);
      if (date) q = q.eq("sighting_date", date);

      if (initialCatalogParam) {
        const { data: mdata } = await supabase
          .from("mantas")
          .select("fk_sighting_id")
          .eq("fk_catalog_id", Number(initialCatalogParam));
        const ids = (mdata || []).map((r: any) => Number(r.fk_sighting_id)).filter(Boolean);
        q = ids.length ? q.in("pk_sighting_id", ids) : q.eq("pk_sighting_id", 0);
      }

      if (initialSightingParam) {
        q = q.eq("pk_sighting_id", Number(initialSightingParam));
      }

      if (canonicalFilteredIds !== null) {
        const ids = Array.from(canonicalFilteredIds);
        if (ids.length === 0) {
          if (mounted) setTotalCount(0);
          return;
        }
        q = q.in("pk_sighting_id", ids);
      }

      const { count, error } = await q;
      if (!mounted) return;

      if (error) {
        console.error("[Sightings] total count error:", error);
        return;
      }

      setTotalCount(count || 0);
    })();

    return () => {
      mounted = false;
    };
  }, [
    helperFiltersReady,
    canonicalFilteredIds,
    island,
    photographer,
    location,
    population,
    mprf,
    minMantas,
    date,
    dateKnown,
    dateUnknown,
    initialCatalogParam,
    initialSightingParam,
  ]);

  const fetchAllMapPoints = useCallback(async () => {
    if (!helperFiltersReady) {
      setMapPoints([]);
      return;
    }

    let base: any = supabase.from("sightings").select("pk_sighting_id,latitude,longitude");

    if (island && island !== "all") base = base.ilike("island", "%" + island + "%");
    if (photographer) base = base.ilike("photographer", "%" + photographer + "%");
    if (location) base = base.eq("sitelocation", location.trim());
    if (population) base = base.ilike("population", "%" + population + "%");
    if (mprf === "MPRF") base = base.eq("is_mprf", true);
    if (mprf === "HAMER") base = base.or("is_mprf.is.false,is_mprf.is.null");
    if (minMantas !== "") base = base.gte("total_mantas", Number(minMantas));
    if (dateKnown) base = base.not("sighting_date", "is", null);
    if (dateUnknown) base = base.is("sighting_date", null);
    if (date) base = base.eq("sighting_date", date);

    if (initialCatalogParam) {
      const { data: mRows } = await supabase
        .from("mantas")
        .select("fk_sighting_id")
        .eq("fk_catalog_id", Number(initialCatalogParam));
      const ids = (mRows || []).map((r: any) => Number(r.fk_sighting_id)).filter(Boolean);
      base = ids.length ? base.in("pk_sighting_id", ids) : base.eq("pk_sighting_id", 0);
    }

    if (initialSightingParam) {
      base = base.eq("pk_sighting_id", Number(initialSightingParam));
    }

    if (canonicalFilteredIds !== null) {
      const ids = Array.from(canonicalFilteredIds);
      if (ids.length === 0) {
        setMapPoints([]);
        return;
      }
      base = base.in("pk_sighting_id", ids);
    }

    const pageSz = 1000;
    const acc: any[] = [];

    for (let from = 0; from < 500000; from += pageSz) {
      const { data, error } = await base.range(from, from + pageSz - 1);
      if (error) {
        console.error("[Sightings] map fetch error:", error);
        break;
      }
      const chunk: any[] = data || [];
      acc.push(...chunk);
      if (chunk.length < pageSz) break;
    }

    const pts = acc
      .filter((r: any) => typeof r.latitude === "number" && typeof r.longitude === "number")
      .map((r: any) => ({
        id: Number(r.pk_sighting_id),
        lat: Number(r.latitude),
        lon: Number(r.longitude),
      }));

    setMapPoints(pts);
  }, [
    helperFiltersReady,
    canonicalFilteredIds,
    island,
    photographer,
    location,
    population,
    mprf,
    minMantas,
    date,
    dateKnown,
    dateUnknown,
    initialCatalogParam,
    initialSightingParam,
  ]);

  const handleOpenMap = useCallback(() => {
    fetchAllMapPoints().then(() => setShowMap(true));
  }, [fetchAllMapPoints]);

  const onClear = useCallback(() => {
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
    setCatalogIdPrefix("");
    setNamePrefix("");
    setMprf("");
    setShowMap(false);
    setShowMantas(false);
    setMantasForSighting(null);

    const sp = new URLSearchParams(searchParams);
    sp.delete("sightingId");
    setSearchParams(sp, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleDeleteSighting = async (id: number) => {
    if (!isAdmin) return;

    const ok = window.confirm(
      "Are you sure you want to delete this sighting? This data can not be recovered."
    );
    if (!ok) return;

    try {
      await supabase.from("sightings").delete().eq("pk_sighting_id", id);
      await query.refetch();
    } catch (err) {
      console.error("[Sightings] delete error:", err);
    }
  };

  function handleSelectFromMap(sid: number) {
    const sp = new URLSearchParams(searchParams);
    sp.set("sightingId", String(sid));
    setSearchParams(sp, { replace: true });
    setShowMap(false);
  }

  const summary = useMemo(() => {
    const p: string[] = [];
    if (date) p.push("Date: " + date);
    if (population) p.push("Population: " + population);
    if (sightingIdPrefix) p.push("Sighting ID starts with: " + sightingIdPrefix);
    if (catalogIdPrefix) p.push("Catalog ID starts with: " + catalogIdPrefix);
    if (namePrefix) p.push("Name starts with: " + namePrefix);
    if (mprf) p.push("Source: " + mprf);
    if (island && island !== "all") p.push("Island: " + island);
    if (location) p.push("Location: " + location);
    if (photographer) p.push("Photographer: " + photographer);
    if (minMantas !== "") p.push(">= Mantas: " + String(minMantas));
    if (dateKnown) p.push("Date: known");
    if (dateUnknown) p.push("Date: unknown");
    if (species) p.push("Species: " + species);
    return p.join("; ");
  }, [date, population, sightingIdPrefix, catalogIdPrefix, namePrefix, mprf, island, location, photographer, minMantas, dateKnown, dateUnknown, species]);

  const isInitialLoading = query.isLoading || !helperFiltersReady;

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 pb-12">
        {initialCatalogParam ? (
          <div className="mt-2 text-sm">
            <Link to={"/browse/catalog?catalogId=" + String(Number(initialCatalogParam))} className="text-blue-600 hover:underline">
              ← Return to Catalog {initialCatalogParam}
            </Link>
          </div>
        ) : null}

        <div className="bg-blue-600 text-white py-6 px-4 sm:px-8 lg:px-16 shadow text-center">
          <h1 className="text-4xl font-bold">Sightings</h1>
        </div>

        <div className="bg-blue-50 px-4 sm:px-8 lg:px-16 py-4 shadow-sm -mt-2">
          <div className="text-sm text-blue-800 mb-2">
            <a href="/browse/data" className="hover:underline">← Return to Browse Data</a>
          </div>

          <div className="flex justify-between items-center mb-3">
          </div>

          <input
            className="mb-3 border rounded px-3 py-2 w-full sm:w-64 text-sm"
            placeholder="Search ID, location, photographer…"
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
            dateKnown={dateKnown}
            setDateKnown={setDateKnown}
            dateUnknown={dateUnknown}
            setDateUnknown={setDateUnknown}
            sightingIdPrefix={sightingIdPrefix}
            setSightingIdPrefix={setSightingIdPrefix}
            catalogIdPrefix={catalogIdPrefix}
            setCatalogIdPrefix={setCatalogIdPrefix}
            namePrefix={namePrefix}
            setNamePrefix={setNamePrefix}
            mprf={mprf}
            setMprf={setMprf}
            onClear={onClear}
            isAdmin={isAdmin}
            species={species}
            setSpecies={setSpecies}
          />

          <div className="flex items-center text-sm text-gray-700 mt-3 gap-2">
            <span>Sort by Sighting&nbsp;ID</span>
            <Button size="icon" variant="ghost" className={sortAsc ? "" : "text-blue-600"} onClick={() => setSortAsc(false)} title="Newest first">▲</Button>
            <Button size="icon" variant="ghost" className={sortAsc ? "text-blue-600" : ""} onClick={() => setSortAsc(true)} title="Oldest first">▼</Button>
          </div>
        </div>

        <div className="text-sm text-gray-700 mb-4">
          Showing {list.length} of {totalCount == null ? "…" : totalCount} total records{summary ? ", filtered by " + summary : ""}
        </div>

        <div className="mb-4">
          <Button variant="outline" className="text-blue-600 border-blue-600" onClick={handleOpenMap}>View Map</Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {isInitialLoading && <p>Loading…</p>}
          {!isInitialLoading && list.length === 0 && <p>No sightings found.</p>}
          {!isInitialLoading && list.map((s) => (
            <Card key={s.pk_sighting_id} data-sighting-id={s.pk_sighting_id} className="overflow-hidden border shadow-sm">
              <CardContent className="p-3 flex flex-col gap-2">
                <div className="text-sm space-y-1">
                  <p><strong className="text-blue-600">Date:</strong> {s.sighting_date || "unknown"}</p>
                  <p><strong>Sighting ID:</strong> {s.pk_sighting_id}</p>
                  <p><strong>Time:</strong> {(s.start_time || "—") + " – " + (s.end_time || "—")}</p>
                  <p><strong>Island:</strong> {s.island || "—"}</p>
                  <p><strong>Location:</strong> {s.sitelocation || "—"}</p>
                  <p><strong>Photographer:</strong> {s.photographer || "—"}</p>
                  <p><strong>Organization:</strong> {s.organization || "—"}</p>
                  <p>
                    <strong>Total Mantas:</strong>{" "}
                    {typeof s.linked_manta_count === "number" && s.linked_manta_count > 0 ? (
                      <button
                        type="button"
                        className="text-blue-600 underline hover:text-blue-700"
                        onClick={() => {
                          setMantasForSighting(s.pk_sighting_id);
                          setShowMantas(true);
                        }}
                        title="Open linked manta rows"
                      >
                        {String(s.linked_manta_count)}
                      </button>
                    ) : (
                      <span className="text-gray-700" title="No linked manta rows available for modal display">
                        {typeof s.total_mantas === "number" ? String(s.total_mantas) : "0"}
                      </span>
                    )}
                  </p>
                </div>

                {isAdmin && (
                  <div className="mt-4 flex justify-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleDeleteSighting(s.pk_sighting_id)}
                      title="Delete sighting"
                    >
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div ref={loadMoreRef} className="h-10" />

        {query.hasNextPage && (
          <div className="mt-2 flex justify-center">
            <Button variant="outline" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
              {query.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}

        <MapDialog
          open={showMap}
          onOpenChange={setShowMap}
          points={mapPoints}
          totalFiltered={totalCount || 0}
          onSelect={handleSelectFromMap}
        />

        <AllMantasInSightingModal
          open={showMantas}
          onOpenChange={setShowMantas}
          sightingId={mantasForSighting}
        />
      </div>
    </Layout>
  );
}
