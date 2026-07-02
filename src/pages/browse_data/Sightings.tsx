import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import SightingFilterBox from "@/components/sightings/SightingFilterBox";
import MapDialog from "@/components/maps/MapDialog";
import MapPickerModal from "@/components/map/MapPickerModal";
import AllMantasInSightingModal from "@/pages/browse_data/components/AllMantasInSightingModal";
import { useIslandsLocations } from "@/lib/useIslandsLocations";
import { logDataChange } from "@/lib/dataChangeAudit";

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
  location_unknown?: boolean | null;
}

type SightingDetail = Sighting & {
  location?: string | null;
  notes?: string | null;
  behavior?: string | null;
  total_manta_ids?: number | null;
  list_manta_ids?: string | null;
  list_manta_ids_2?: string | null;
  list_catalog_ids?: string | null;
  is_mprf?: boolean | null;
};

type SightingMantaRow = {
  pk_manta_id: number;
  fk_catalog_id: number | null;
  name: string | null;
  manta_name?: string | null;
  gender: string | null;
  age_class: string | null;
  is_mprf: boolean | null;
};

type SightingSavedEvent =
  | { type: "sighting_updated"; sightingId: number; changedFields: string[] }
  | { type: "linked_manta_deleted"; sightingId: number; mantaId: number }
  | { type: "sighting_manta_summary_synced"; sightingId: number }
  | { type: "sighting_deleted"; sightingId: number };

const PAGE_SIZE = 50;
const LOCATION_UNKNOWN = "__location_unknown__";
const LOCATION_NONE = "__location_none__";
const SIGHTING_DETAIL_COLUMNS = [
  "pk_sighting_id",
  "sighting_date",
  "start_time",
  "end_time",
  "population",
  "island",
  "sitelocation",
  "location",
  "latitude",
  "longitude",
  "location_unknown",
  "photographer",
  "organization",
  "total_mantas",
  "total_manta_ids",
  "list_manta_ids",
  "list_manta_ids_2",
  "list_catalog_ids",
  "notes",
  "behavior",
  "is_mprf",
].join(",");

function applyLocationFilter(query: any, location: string) {
  const loc = location.trim();
  if (!loc) return query;
  if (loc === LOCATION_UNKNOWN) {
    return query.or("and(sitelocation.is.null,location.is.null),and(sitelocation.eq.,location.eq.),and(sitelocation.is.null,location.eq.),and(sitelocation.eq.,location.is.null)");
  }
  if (loc === LOCATION_NONE) {
    return query.or("sitelocation.ilike.none,location.ilike.none");
  }
  return query.or(`sitelocation.eq.${loc},and(sitelocation.is.null,location.eq.${loc})`);
}

function locationSummaryLabel(location: string) {
  if (location === LOCATION_UNKNOWN) return "unknown";
  if (location === LOCATION_NONE) return "none";
  return location;
}

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
  const showHamrFilter = isAdmin;
  const [sortAsc, setSortAsc] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const [showMap, setShowMap] = useState(false);
  const [mapPoints, setMapPoints] = useState<Array<{ id: number; lat: number; lon: number }>>([]);
  const [showMantas, setShowMantas] = useState(false);
  const [mantasForSighting, setMantasForSighting] = useState<number | null>(null);
  const [showSightingDetail, setShowSightingDetail] = useState(false);
  const [detailSightingId, setDetailSightingId] = useState<number | null>(null);

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
      .select("pk_sighting_id,sighting_date,start_time,end_time,island,sitelocation,latitude,longitude,photographer,organization,total_mantas,population,is_mprf")
      .order("pk_sighting_id", { ascending: sortAsc })
      .range(pageParam * PAGE_SIZE, pageParam * PAGE_SIZE + PAGE_SIZE - 1);

    if (!isAdmin) q = q.or("is_mprf.is.false,is_mprf.is.null");
    if (island && island !== "all") q = q.ilike("island", "%" + island + "%");
    if (photographer) q = q.ilike("photographer", "%" + photographer + "%");
    q = applyLocationFilter(q, location);
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

      if (!isAdmin) q = q.or("is_mprf.is.false,is_mprf.is.null");
      if (island && island !== "all") q = q.ilike("island", "%" + island + "%");
      if (photographer) q = q.ilike("photographer", "%" + photographer + "%");
      q = applyLocationFilter(q, location);
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

    let base: any = supabase.from("sightings").select("pk_sighting_id,latitude,longitude,is_mprf");

    if (!isAdmin) base = base.or("is_mprf.is.false,is_mprf.is.null");

    if (island && island !== "all") base = base.ilike("island", "%" + island + "%");
    if (photographer) base = base.ilike("photographer", "%" + photographer + "%");
    base = applyLocationFilter(base, location);
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
    setShowSightingDetail(false);
    setDetailSightingId(null);

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
    setDetailSightingId(sid);
    setShowSightingDetail(true);
    setShowMap(false);
  }

  function openSightingDetail(sid: number) {
    setDetailSightingId(sid);
    setShowSightingDetail(true);
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
    if (location) p.push("Location: " + locationSummaryLabel(location));
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
                  <p>
                    <strong>Sighting ID:</strong>{" "}
                    <button
                      type="button"
                      className="font-medium text-blue-600 underline hover:text-blue-700"
                      onClick={() => openSightingDetail(s.pk_sighting_id)}
                      title="Open sighting details"
                    >
                      {s.pk_sighting_id}
                    </button>
                  </p>
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

        <SightingDetailModal
          open={showSightingDetail}
          onOpenChange={setShowSightingDetail}
          sightingId={detailSightingId}
          onOpenMantas={(sid) => {
            setMantasForSighting(sid);
            setShowMantas(true);
          }}
          isAdmin={isAdmin}
          onSaved={() => {
            query.refetch();
            fetchAllMapPoints();
          }}
        />
      </div>
    </Layout>
  );
}

export function SightingDetailModal({
  open,
  onOpenChange,
  sightingId,
  onOpenMantas,
  onOpenRecord,
  isAdmin,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sightingId: number | null;
  onOpenMantas: (sightingId: number) => void;
  onOpenRecord?: (target: { type: "manta" | "catalog"; id: number }) => void;
  isAdmin: boolean;
  onSaved: (event?: SightingSavedEvent) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<SightingDetail | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [mantas, setMantas] = useState<SightingMantaRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");
  const [showPicker, setShowPicker] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const {
    locations,
    loadingLoc,
    err: locationError,
    reloadLocations,
  } = useIslandsLocations(draft.island || "");
  const sightingPatch = useMemo(() => (row ? createSightingPatch(draft) : null), [draft, row]);
  const changedFields = useMemo(() => {
    if (!row || !sightingPatch) return [];
    return Object.keys(sightingPatch).filter((field) =>
      auditValueChanged((row as Record<string, unknown>)[field], sightingPatch[field as keyof typeof sightingPatch])
    );
  }, [row, sightingPatch]);
  const hasUnsavedChanges = changedFields.length > 0 && saveState !== "saved";
  const hasChangeReason = changeReason.trim().length > 0;

  async function deleteLinkedManta(manta: SightingMantaRow) {
    if (!isAdmin || !row) return;

    setSaving(true);
    setSaveMessage(null);
    setError(null);

    const [
      { data: currentManta, error: mantaError },
      photosResult,
      sizesResult,
      biopsiesResult,
      mprfMapResult,
      canonicalCandidatesResult,
    ] = await Promise.all([
      supabase.from("mantas").select("*").eq("pk_manta_id", manta.pk_manta_id).maybeSingle(),
      supabase.from("photos").select("*", { count: "exact" }).eq("fk_manta_id", manta.pk_manta_id),
      supabase.from("manta_sizes").select("*", { count: "exact" }).eq("fk_manta_id", manta.pk_manta_id),
      supabase.from("biopsies").select("*", { count: "exact" }).eq("fk_manta_id", manta.pk_manta_id),
      supabase.from("mprf_manta_map").select("*", { count: "exact" }).eq("pk_manta_id", manta.pk_manta_id),
      supabase
        .from("mantas")
        .select("pk_manta_id,fk_catalog_id,name,fk_sighting_id,catalog:fk_catalog_id(name)")
        .eq("fk_sighting_id", row.pk_sighting_id)
        .neq("pk_manta_id", manta.pk_manta_id),
    ]);

    setSaving(false);

    if (mantaError) {
      setSaveMessage(`Could not inspect manta ${manta.pk_manta_id}: ${mantaError.message}`);
      return;
    }
    if (!currentManta) {
      setSaveMessage(`Manta ${manta.pk_manta_id} was already deleted. Refresh QC to update this view.`);
      setMantas((prev) => prev.filter((m) => m.pk_manta_id !== manta.pk_manta_id));
      onSaved({ type: "linked_manta_deleted", sightingId: row.pk_sighting_id, mantaId: manta.pk_manta_id });
      return;
    }
    if (Number((currentManta as any).fk_sighting_id) !== row.pk_sighting_id) {
      setSaveMessage(
        `Manta ${manta.pk_manta_id} no longer points to sighting ${row.pk_sighting_id}. Refresh before deleting.`
      );
      return;
    }

    const childCounts = {
      photos: photosResult.count ?? photosResult.data?.length ?? 0,
      manta_sizes: sizesResult.count ?? sizesResult.data?.length ?? 0,
      biopsies: biopsiesResult.count ?? biopsiesResult.data?.length ?? 0,
      mprf_manta_map: mprfMapResult.count ?? mprfMapResult.data?.length ?? 0,
    };
    const childErrors = [
      photosResult.error ? `photos: ${photosResult.error.message}` : null,
      sizesResult.error ? `manta_sizes: ${sizesResult.error.message}` : null,
      biopsiesResult.error ? `biopsies: ${biopsiesResult.error.message}` : null,
      mprfMapResult.error ? `mprf_manta_map: ${mprfMapResult.error.message}` : null,
      canonicalCandidatesResult.error ? `canonical manta lookup: ${canonicalCandidatesResult.error.message}` : null,
    ].filter(Boolean);
    if (childErrors.length > 0) {
      setSaveMessage(`Could not inspect linked records for manta ${manta.pk_manta_id}: ${childErrors.join("; ")}`);
      return;
    }
    const targetName = cleanIdentityText((currentManta as any).name ?? manta.manta_name ?? manta.name);
    const canonicalCandidates = ((canonicalCandidatesResult.data ?? []) as Array<Record<string, any>>).filter((candidate) => {
      if ((currentManta as any).fk_catalog_id != null && Number(candidate.fk_catalog_id) === Number((currentManta as any).fk_catalog_id)) {
        return true;
      }
      if (!targetName) return false;
      return cleanIdentityText(candidate.name ?? candidate.catalog?.name) === targetName;
    });
    const canonicalManta = canonicalCandidates.length === 1 ? canonicalCandidates[0] : null;
    let childMergeTargetManta: Record<string, any> | null = canonicalManta;
    const childRows = {
      photos: (photosResult.data ?? []) as Array<Record<string, unknown>>,
      manta_sizes: (sizesResult.data ?? []) as Array<Record<string, unknown>>,
      biopsies: (biopsiesResult.data ?? []) as Array<Record<string, unknown>>,
      mprf_manta_map: (mprfMapResult.data ?? []) as Array<Record<string, unknown>>,
    };
    const totalChildRows =
      childRows.photos.length + childRows.manta_sizes.length + childRows.biopsies.length + childRows.mprf_manta_map.length;

    if (totalChildRows > 0 && !childMergeTargetManta) {
      const keptMantaIdText = window.prompt(
        `Manta ${manta.pk_manta_id} has linked child records. Enter the kept manta ID that should receive those photos, size rows, biopsy rows, and source-map rows before this duplicate manta is deleted.`
      )?.trim();
      const keptMantaId = Number(keptMantaIdText);
      if (!keptMantaIdText || !Number.isFinite(keptMantaId) || keptMantaId === manta.pk_manta_id) {
        setSaveMessage("Manta delete canceled: a valid kept manta ID is required before moving linked child records.");
        return;
      }

      setSaving(true);
      const { data: keptManta, error: keptMantaError } = await supabase
        .from("mantas")
        .select("pk_manta_id,fk_catalog_id,name,fk_sighting_id,catalog:fk_catalog_id(name)")
        .eq("pk_manta_id", keptMantaId)
        .maybeSingle();
      setSaving(false);

      if (keptMantaError) {
        setSaveMessage(`Could not inspect kept manta ${keptMantaId}: ${keptMantaError.message}`);
        return;
      }
      if (!keptManta) {
        setSaveMessage(`Kept manta ${keptMantaId} was not found. No changes were made.`);
        return;
      }

      const sameCatalog =
        (currentManta as any).fk_catalog_id != null &&
        (keptManta as any).fk_catalog_id != null &&
        Number((currentManta as any).fk_catalog_id) === Number((keptManta as any).fk_catalog_id);
      const sameName =
        targetName.length > 0 &&
        cleanIdentityText((keptManta as any).name ?? (keptManta as any).catalog?.name) === targetName;
      if (!sameCatalog && !sameName) {
        const mismatchConfirmed = window.confirm(
          `Kept manta ${keptMantaId} does not appear to share the same catalog ID or name as duplicate manta ${manta.pk_manta_id}.\n\n` +
            `Duplicate catalog/name: ${(currentManta as any).fk_catalog_id ?? "none"} / ${targetName || "none"}\n` +
            `Kept catalog/name: ${(keptManta as any).fk_catalog_id ?? "none"} / ${cleanIdentityText((keptManta as any).name ?? (keptManta as any).catalog?.name) || "none"}\n\n` +
            `Continue only if you have verified this is the correct kept manta.`
        );
        if (!mismatchConfirmed) {
          setSaveMessage("Manta delete canceled: kept manta mismatch was not confirmed.");
          return;
        }
      }

      childMergeTargetManta = keptManta as Record<string, any>;
    }

    const reason = window.prompt(
      `Reason for deleting manta ${manta.pk_manta_id} from sighting ${row.pk_sighting_id}?\n\nThis will be written to the audit ledger.`
    )?.trim();
    if (!reason) {
      setSaveMessage("Manta delete canceled: an audit reason is required.");
      return;
    }

    const listPatch = createMantaListRemovalPatch(row, manta.pk_manta_id);
    const listFields = Object.keys(listPatch);
    const listMessage = listFields.length
      ? `\nIt will also remove ${manta.pk_manta_id} from ${listFields.join(", ")}.`
      : "\nThis manta ID is not present in the recorded manta list fields.";
    const keptMantaId = childMergeTargetManta ? Number(childMergeTargetManta.pk_manta_id) : null;
    const childMoveMessage =
      totalChildRows > 0
        ? `\nIt will audit and move ${childRows.photos.length} photo(s), ${childRows.manta_sizes.length} size row(s), ${childRows.biopsies.length} biopsy row(s), and ${childRows.mprf_manta_map.length} MPRF source-map row(s) to kept manta ${keptMantaId}.`
        : "";
    const confirmed = window.confirm(
      `Merge duplicate manta ${manta.pk_manta_id}${keptMantaId ? ` into kept manta ${keptMantaId}` : ""}, then delete ${manta.pk_manta_id}?\n\n` +
        `Catalog: ${manta.fk_catalog_id ?? "none"}\n` +
        `Name: ${manta.manta_name || manta.name || "none"}\n` +
        `Linked records found: ${childRows.photos.length} photo(s), ${childRows.manta_sizes.length} size row(s), ${childRows.biopsies.length} biopsy row(s), ${childRows.mprf_manta_map.length} MPRF source-map row(s).${listMessage}${childMoveMessage}\n\n` +
        `This will audit every child move and the final manta delete.`
    );
    if (!confirmed) {
      setSaveMessage("Manta delete canceled.");
      return;
    }

    setSaving(true);
    setSaveMessage(null);

    try {
      if (listFields.length > 0) {
        await logDataChange({
          action: "update",
          tableName: "sightings",
          primaryKey: row.pk_sighting_id,
          recordLabel: `sighting ${row.pk_sighting_id}`,
          reason,
          oldData: pickFields(row as unknown as Record<string, unknown>, listFields),
          newData: pickFields(listPatch, listFields),
          changedFields: listFields,
          metadata: {
            editor: "sighting_detail_modal",
              qc_action: "merge_duplicate_manta_children",
              deleted_manta_id: manta.pk_manta_id,
            },
          });

        const { data: updatedSighting, error: listError } = await supabase
          .from("sightings")
          .update(listPatch)
          .eq("pk_sighting_id", row.pk_sighting_id)
          .select(SIGHTING_DETAIL_COLUMNS)
          .single();

        if (listError) throw new Error(`Manta list was not updated: ${listError.message}`);
        setRow(updatedSighting as SightingDetail);
        setDraft(sightingToDraft(updatedSighting as SightingDetail));
      }

      if (childRows.photos.length > 0) {
        if (!keptMantaId) {
          throw new Error("Photo rows were not moved: no kept manta was selected.");
        }
        const photoPatch = { fk_manta_id: keptMantaId };
        for (const photoRow of childRows.photos) {
          const photoPrimaryKey = String(photoRow.pk_photo_id ?? photoRow.id ?? JSON.stringify(photoRow));
          await logDataChange({
            action: "update",
            tableName: "photos",
            primaryKey: photoPrimaryKey,
            recordLabel: `photo ${photoPrimaryKey}`,
            reason,
            oldData: photoRow,
            newData: photoPatch,
            changedFields: ["fk_manta_id"],
            metadata: {
              editor: "sighting_detail_modal",
              qc_action: "merge_duplicate_manta_children",
              qc_step: "move_duplicate_manta_photo_to_kept_manta",
              deleted_manta_id: manta.pk_manta_id,
              kept_manta_id: keptMantaId,
              sighting_id: row.pk_sighting_id,
            },
          });
        }

        const { error: photoMoveError } = await supabase
          .from("photos")
          .update(photoPatch)
          .eq("fk_manta_id", manta.pk_manta_id);

        if (photoMoveError) {
          throw new Error(`Photo rows were not moved: ${photoMoveError.message}`);
        }
      }

      if (childRows.biopsies.length > 0) {
        if (!keptMantaId) {
          throw new Error("Biopsy rows were not moved: no kept manta was selected.");
        }
        const biopsyPatch = { fk_manta_id: keptMantaId };
        for (const biopsyRow of childRows.biopsies) {
          const biopsyPrimaryKey = String(biopsyRow.pk_biopsy_id ?? biopsyRow.id ?? JSON.stringify(biopsyRow));
          await logDataChange({
            action: "update",
            tableName: "biopsies",
            primaryKey: biopsyPrimaryKey,
            recordLabel: `biopsy ${biopsyPrimaryKey}`,
            reason,
            oldData: biopsyRow,
            newData: biopsyPatch,
            changedFields: ["fk_manta_id"],
            metadata: {
              editor: "sighting_detail_modal",
              qc_action: "merge_duplicate_manta_children",
              qc_step: "move_duplicate_manta_biopsy_to_kept_manta",
              deleted_manta_id: manta.pk_manta_id,
              kept_manta_id: keptMantaId,
              sighting_id: row.pk_sighting_id,
            },
          });
        }

        const { error: biopsyMoveError } = await supabase
          .from("biopsies")
          .update(biopsyPatch)
          .eq("fk_manta_id", manta.pk_manta_id);

        if (biopsyMoveError) {
          throw new Error(`Biopsy rows were not moved: ${biopsyMoveError.message}`);
        }
      }

      if (childRows.mprf_manta_map.length > 0) {
        if (!keptMantaId) {
          throw new Error("MPRF source-map rows were not moved: no kept manta was selected.");
        }
        for (const mapRow of childRows.mprf_manta_map) {
          const mapPrimaryKey = String(mapRow.pk_mprf_manta_id ?? `${manta.pk_manta_id}:${keptMantaId}`);
          const mapPatch = { pk_manta_id: keptMantaId };
          await logDataChange({
            action: "update",
            tableName: "mprf_manta_map",
            primaryKey: mapPrimaryKey,
            recordLabel: `mprf manta map ${mapPrimaryKey}`,
            reason,
            oldData: mapRow,
            newData: mapPatch,
            changedFields: ["pk_manta_id"],
            metadata: {
              editor: "sighting_detail_modal",
              qc_action: "merge_duplicate_manta_children",
              qc_step: "move_mprf_manta_map_to_kept_manta",
              deleted_manta_id: manta.pk_manta_id,
              kept_manta_id: keptMantaId,
              sighting_id: row.pk_sighting_id,
            },
          });

          const { error: mapUpdateError } = await supabase
            .from("mprf_manta_map")
            .update(mapPatch)
            .eq("pk_mprf_manta_id", mapRow.pk_mprf_manta_id);
          if (mapUpdateError) {
            throw new Error(`MPRF source map was not moved: ${mapUpdateError.message}`);
          }
        }
      }

      if (childRows.manta_sizes.length > 0) {
        if (!keptMantaId) {
          throw new Error(`Size rows were not moved: no kept manta was selected.`);
        }
        const sizePatch = { fk_manta_id: keptMantaId };
        for (const sizeRow of childRows.manta_sizes) {
          const sizePrimaryKey = String(sizeRow.pk_manta_size_id ?? sizeRow.pk_size_id ?? sizeRow.id ?? JSON.stringify(sizeRow));
          await logDataChange({
            action: "update",
            tableName: "manta_sizes",
            primaryKey: sizePrimaryKey,
            recordLabel: `manta size ${sizePrimaryKey}`,
            reason,
            oldData: sizeRow,
            newData: sizePatch,
            changedFields: ["fk_manta_id"],
            metadata: {
              editor: "sighting_detail_modal",
              qc_action: "merge_duplicate_manta_children",
              qc_step: "move_duplicate_manta_size_rows_to_kept_manta",
              deleted_manta_id: manta.pk_manta_id,
              kept_manta_id: keptMantaId,
              sighting_id: row.pk_sighting_id,
            },
          });
        }

        const { error: sizeDeleteError } = await supabase
          .from("manta_sizes")
          .update(sizePatch)
          .eq("fk_manta_id", manta.pk_manta_id);

        if (sizeDeleteError) {
          throw new Error(`Manta size rows were not moved: ${sizeDeleteError.message}`);
        }
      }

      await logDataChange({
        action: "delete",
        tableName: "mantas",
        primaryKey: manta.pk_manta_id,
        recordLabel: `manta ${manta.pk_manta_id}`,
        reason,
        oldData: currentManta as Record<string, unknown>,
        newData: {},
        changedFields: Object.keys(currentManta as Record<string, unknown>),
        metadata: {
          editor: "sighting_detail_modal",
          qc_action: "merge_duplicate_manta_children",
          sighting_id: row.pk_sighting_id,
          child_counts: childCounts,
          moved_child_rows_to_manta_id: keptMantaId,
          moved_photo_rows: childRows.photos.length,
          moved_size_rows: childRows.manta_sizes.length,
          moved_biopsy_rows: childRows.biopsies.length,
          moved_mprf_manta_map_rows: childRows.mprf_manta_map.length,
        },
      });

      const { error: deleteError } = await supabase
        .from("mantas")
        .delete()
        .eq("pk_manta_id", manta.pk_manta_id)
        .eq("fk_sighting_id", row.pk_sighting_id);

      if (deleteError) throw new Error(`Manta ${manta.pk_manta_id} was not deleted: ${deleteError.message}`);

      setMantas((prev) => prev.filter((m) => m.pk_manta_id !== manta.pk_manta_id));
      const summarySync = await syncSightingMantaSummary(reason, {
        qc_action: "merge_duplicate_manta_children",
        qc_step: "sync_sighting_manta_summary_after_manta_delete",
        deleted_manta_id: manta.pk_manta_id,
        kept_manta_id: keptMantaId,
      });
      const movedChildMessage =
        keptMantaId && totalChildRows > 0
          ? ` Moved ${childRows.photos.length} photo(s), ${childRows.manta_sizes.length} size row(s), ${childRows.biopsies.length} biopsy row(s), and ${childRows.mprf_manta_map.length} MPRF source-map row(s) to manta ${keptMantaId}.`
          : "";
      setSaveMessage(
        `Manta ${manta.pk_manta_id} deleted and audited.${movedChildMessage}${summarySync.changedFields.length > 0 ? ` Synced sighting summary fields: ${summarySync.changedFields.join(", ")}.` : " Sighting summary already matched linked mantas."}`
      );
      onSaved({ type: "linked_manta_deleted", sightingId: row.pk_sighting_id, mantaId: manta.pk_manta_id });
    } catch (deleteError) {
      setSaveMessage(deleteError instanceof Error ? deleteError.message : `Could not delete manta ${manta.pk_manta_id}.`);
    } finally {
      setSaving(false);
    }
  }

  async function syncSightingMantaSummary(
    reason: string,
    metadata: Record<string, unknown> = {}
  ): Promise<{ changedFields: string[]; linkedMantaCount: number }> {
    if (!row) return { changedFields: [], linkedMantaCount: 0 };

    const sightingId = row.pk_sighting_id;
    const [currentSightingResult, linkedMantasResult] = await Promise.all([
      supabase.from("sightings").select(SIGHTING_DETAIL_COLUMNS).eq("pk_sighting_id", sightingId).single(),
      supabase
        .from("mantas")
        .select("pk_manta_id,fk_catalog_id,name,gender,age_class,is_mprf,catalog:fk_catalog_id(name)")
        .eq("fk_sighting_id", sightingId)
        .order("pk_manta_id", { ascending: true }),
    ]);

    if (currentSightingResult.error) {
      throw new Error(`Could not reload sighting ${sightingId}: ${currentSightingResult.error.message}`);
    }
    if (linkedMantasResult.error) {
      throw new Error(`Could not reload linked mantas for sighting ${sightingId}: ${linkedMantasResult.error.message}`);
    }

    const currentSighting = currentSightingResult.data as SightingDetail;
    const linkedMantas = (linkedMantasResult.data ?? []) as Array<Record<string, any>>;
    const mantaIds = linkedMantas.map((m) => Number(m.pk_manta_id)).filter((id) => Number.isFinite(id));
    const catalogIds = linkedMantas
      .map((m) => (m.fk_catalog_id == null ? null : Number(m.fk_catalog_id)))
      .filter((id): id is number => id != null && Number.isFinite(id));
    const summaryPatch: Partial<SightingDetail> = {
      total_mantas: mantaIds.length,
      total_manta_ids: mantaIds.length,
      list_manta_ids_2: mantaIds.length > 0 ? mantaIds.join(",") : null,
      list_catalog_ids: catalogIds.length > 0 ? catalogIds.join(",") : null,
    };
    const summaryFields = Object.keys(summaryPatch);
    const changedSummaryFields = summaryFields.filter((field) =>
      summaryValueChanged(
        field,
        (currentSighting as unknown as Record<string, unknown>)[field],
        (summaryPatch as Record<string, unknown>)[field]
      )
    );

    if (changedSummaryFields.length > 0) {
      await logDataChange({
        action: "update",
        tableName: "sightings",
        primaryKey: sightingId,
        recordLabel: `sighting ${sightingId}`,
        reason,
        oldData: pickFields(currentSighting as unknown as Record<string, unknown>, changedSummaryFields),
        newData: pickFields(summaryPatch as Record<string, unknown>, changedSummaryFields),
        changedFields: changedSummaryFields,
        metadata: {
          editor: "sighting_detail_modal",
          qc_action: "sync_sighting_manta_summary",
          linked_manta_ids: mantaIds,
          linked_catalog_ids: catalogIds,
          ...metadata,
        },
      });

      const { data: updatedSighting, error: updateError } = await supabase
        .from("sightings")
        .update(pickFields(summaryPatch as Record<string, unknown>, changedSummaryFields))
        .eq("pk_sighting_id", sightingId)
        .select(SIGHTING_DETAIL_COLUMNS)
        .single();

      if (updateError) {
        throw new Error(`Could not sync sighting ${sightingId} manta summary: ${updateError.message}`);
      }

      setRow(updatedSighting as SightingDetail);
      setDraft(sightingToDraft(updatedSighting as SightingDetail));
    } else {
      setRow(currentSighting);
      setDraft(sightingToDraft(currentSighting));
    }

    setMantas(linkedMantas.map(mantaRowToState));
    return { changedFields: changedSummaryFields, linkedMantaCount: mantaIds.length };
  }

  async function syncSightingMantaSummaryFromModal() {
    if (!isAdmin || !row) return;

    const reason =
      changeReason.trim() ||
      window
        .prompt(
          `Reason for syncing sighting ${row.pk_sighting_id}'s manta summary from linked manta rows?\n\nThis will be written to the audit ledger if anything changes.`
        )
        ?.trim() ||
      "";
    if (!reason) {
      setSaveMessage("Summary sync canceled: an audit reason is required.");
      return;
    }

    const confirmed = window.confirm(
      `Sync sighting ${row.pk_sighting_id}'s stored manta summary from its actual linked manta rows?\n\n` +
        `This can update total_mantas, total_manta_ids, list_manta_ids_2, and list_catalog_ids. It does not delete raw manta rows.`
    );
    if (!confirmed) {
      setSaveMessage("Summary sync canceled.");
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    setError(null);
    try {
      const summarySync = await syncSightingMantaSummary(reason, {
        qc_action: "manual_sync_sighting_manta_summary",
      });
      setSaveMessage(
        summarySync.changedFields.length > 0
          ? `Synced ${summarySync.changedFields.join(", ")} from ${summarySync.linkedMantaCount} linked manta row(s). Run QC again to refresh the snapshot.`
          : `Sighting summary already matches ${summarySync.linkedMantaCount} linked manta row(s).`
      );
      setChangeReason("");
      setSaveState("saved");
      onSaved({ type: "sighting_manta_summary_synced", sightingId: row.pk_sighting_id });
    } catch (syncError) {
      setSaveMessage(syncError instanceof Error ? syncError.message : "Could not sync sighting manta summary.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSighting() {
    if (!isAdmin || !row) return;

    setSaving(true);
    setSaveMessage(null);
    setError(null);

    const [
      { data: currentSighting, error: sightingError },
      mantasResult,
      photosResult,
      biopsiesResult,
      mprfMapResult,
    ] = await Promise.all([
      supabase.from("sightings").select("*").eq("pk_sighting_id", row.pk_sighting_id).maybeSingle(),
      supabase.from("mantas").select("pk_manta_id", { count: "exact" }).eq("fk_sighting_id", row.pk_sighting_id).limit(20),
      supabase.from("photos").select("pk_photo_id", { count: "exact" }).eq("fk_sighting_id", row.pk_sighting_id).limit(20),
      supabase.from("biopsies").select("pk_biopsy_id", { count: "exact" }).eq("fk_sighting_id", row.pk_sighting_id).limit(20),
      supabase.from("mprf_sighting_map").select("*", { count: "exact" }).eq("pk_sighting_id", row.pk_sighting_id),
    ]);

    setSaving(false);

    if (sightingError) {
      setSaveMessage(`Could not inspect sighting ${row.pk_sighting_id}: ${sightingError.message}`);
      return;
    }
    if (!currentSighting) {
      setSaveMessage(`Sighting ${row.pk_sighting_id} was already deleted. Refresh QC to update this view.`);
      onOpenChange(false);
      onSaved({ type: "sighting_deleted", sightingId: row.pk_sighting_id });
      return;
    }

    const inspectErrors = [
      mantasResult.error ? `mantas: ${mantasResult.error.message}` : null,
      photosResult.error ? `photos: ${photosResult.error.message}` : null,
      biopsiesResult.error ? `biopsies: ${biopsiesResult.error.message}` : null,
      mprfMapResult.error ? `mprf_sighting_map: ${mprfMapResult.error.message}` : null,
    ].filter(Boolean);
    if (inspectErrors.length > 0) {
      setSaveMessage(`Could not inspect linked records for sighting ${row.pk_sighting_id}: ${inspectErrors.join("; ")}`);
      return;
    }

    const childCounts = {
      mantas: mantasResult.count ?? mantasResult.data?.length ?? 0,
      photos: photosResult.count ?? photosResult.data?.length ?? 0,
      biopsies: biopsiesResult.count ?? biopsiesResult.data?.length ?? 0,
      mprf_sighting_map: mprfMapResult.count ?? mprfMapResult.data?.length ?? 0,
    };
    if (childCounts.mantas + childCounts.photos + childCounts.biopsies > 0) {
      setSaveMessage(
        `Sighting ${row.pk_sighting_id} still has ${childCounts.mantas} manta row(s), ${childCounts.photos} photo row(s), and ${childCounts.biopsies} biopsy row(s). Delete, move, or review those linked records before deleting the sighting.`
      );
      return;
    }

    const reason = window.prompt(
      `Reason for deleting sighting ${row.pk_sighting_id}?\n\nThis will be written to the audit ledger.`
    )?.trim();
    if (!reason) {
      setSaveMessage("Sighting delete canceled: an audit reason is required.");
      return;
    }

    const confirmed = window.confirm(
      `Delete sighting ${row.pk_sighting_id}?\n\n` +
        `Linked records found: 0 mantas, 0 photos, 0 biopsies, ${childCounts.mprf_sighting_map} MPRF source-map row(s).\n` +
        (childCounts.mprf_sighting_map > 0
          ? `It will audit and delete the ${childCounts.mprf_sighting_map} MPRF source-map row(s) first.\n\n`
          : "\n") +
        `This will audit the sighting delete before removing the sighting row.`
    );
    if (!confirmed) {
      setSaveMessage("Sighting delete canceled.");
      return;
    }

    setSaving(true);
    setSaveMessage(null);

    try {
      for (const mapRow of (mprfMapResult.data ?? []) as Array<Record<string, unknown>>) {
        const mapPrimaryKey = String(mapRow.pk_mprf_sighting_id ?? `${row.pk_sighting_id}`);
        await logDataChange({
          action: "delete",
          tableName: "mprf_sighting_map",
          primaryKey: mapPrimaryKey,
          recordLabel: `mprf sighting map ${mapPrimaryKey}`,
          reason,
          oldData: mapRow,
          newData: {},
          changedFields: Object.keys(mapRow),
          metadata: {
            editor: "sighting_detail_modal",
            qc_action: "delete_sighting_row",
            qc_step: "delete_mprf_sighting_map_before_sighting",
            sighting_id: row.pk_sighting_id,
          },
        });

        const { error: mapDeleteError } = await supabase
          .from("mprf_sighting_map")
          .delete()
          .eq("pk_mprf_sighting_id", mapRow.pk_mprf_sighting_id);
        if (mapDeleteError) {
          throw new Error(`MPRF sighting source map was not deleted: ${mapDeleteError.message}`);
        }
      }

      await logDataChange({
        action: "delete",
        tableName: "sightings",
        primaryKey: row.pk_sighting_id,
        recordLabel: `sighting ${row.pk_sighting_id}`,
        reason,
        oldData: currentSighting as Record<string, unknown>,
        newData: {},
        changedFields: Object.keys(currentSighting as Record<string, unknown>),
        metadata: {
          editor: "sighting_detail_modal",
          qc_action: "delete_sighting_row",
          child_counts: childCounts,
        },
      });

      const { error: deleteError } = await supabase
        .from("sightings")
        .delete()
        .eq("pk_sighting_id", row.pk_sighting_id);
      if (deleteError) {
        throw new Error(`Sighting ${row.pk_sighting_id} was not deleted: ${deleteError.message}`);
      }

      setSaveMessage(`Sighting ${row.pk_sighting_id} deleted and audited.`);
      onOpenChange(false);
      onSaved();
    } catch (deleteError) {
      setSaveMessage(deleteError instanceof Error ? deleteError.message : `Could not delete sighting ${row.pk_sighting_id}.`);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!open || !sightingId) return;

      setLoading(true);
      setError(null);
      setSaveMessage(null);
      setSaveState("idle");
      setRow(null);
      setDraft({});
      setMantas([]);
      setChangeReason("");

      const { data: sightingRow, error: sightingError } = await supabase
        .from("sightings")
        .select(SIGHTING_DETAIL_COLUMNS)
        .eq("pk_sighting_id", sightingId)
        .maybeSingle();

      if (!alive) return;

      if (sightingError) {
        setError(sightingError.message);
        setLoading(false);
        return;
      }
      if (!sightingRow) {
        setError(`Sighting ${sightingId} was not found. It may have already been merged or deleted; refresh QC to remove stale links.`);
        setLoading(false);
        return;
      }

      const { data: mantaRows, error: mantaError } = await supabase
        .from("mantas")
        .select("pk_manta_id,fk_catalog_id,name,gender,age_class,is_mprf,catalog:fk_catalog_id(name)")
        .eq("fk_sighting_id", sightingId)
        .order("pk_manta_id", { ascending: true });

      if (!alive) return;

      if (mantaError) {
        setError(mantaError.message);
        setRow(sightingRow as SightingDetail);
        setLoading(false);
        return;
      }

      setRow(sightingRow as SightingDetail);
      setDraft(sightingToDraft(sightingRow as SightingDetail));
      setMantas((mantaRows ?? []).map(mantaRowToState));
      setLoading(false);
    }

    load();

    return () => {
      alive = false;
    };
  }, [open, sightingId]);

  function setDraftField(field: string, value: string) {
    setSaveState("idle");
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  function applyKnownLocation(name: string) {
    const match = locations.find((loc) => loc.name === name);
    setSaveState("idle");
    setDraft((prev) => ({
      ...prev,
      sitelocation: name,
      location: name,
      location_unknown: "false",
      latitude: match?.latitude != null ? String(match.latitude) : prev.latitude,
      longitude: match?.longitude != null ? String(match.longitude) : prev.longitude,
    }));
  }

  async function addLocationDefault() {
    if (!isAdmin) return;
    const reason = changeReason.trim();
    if (!reason) {
      setSaveMessage("Add a change reason before saving location menu changes.");
      return;
    }
    const name = draft.sitelocation.trim();
    const island = draft.island.trim();
    const latitude = Number(draft.latitude);
    const longitude = Number(draft.longitude);
    if (!name || !island || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setSaveMessage("Add a location name, island, latitude, and longitude first.");
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    const { error: existingError, data: existing } = await supabase
      .from("location_defaults")
      .select("name,island")
      .eq("island", island)
      .eq("name", name)
      .maybeSingle();
    if (existingError) {
      setSaving(false);
      setSaveMessage(existingError.message);
      return;
    }

    const request = existing
      ? supabase.from("location_defaults").update({ latitude, longitude }).eq("island", island).eq("name", name)
      : supabase.from("location_defaults").insert({ name, island, latitude, longitude });
    try {
      await logDataChange({
        action: existing ? "update" : "insert",
        tableName: "location_defaults",
        primaryKey: `${island}:${name}`,
        recordLabel: `location ${name}`,
        reason,
        oldData: existing ? { name: existing.name, island: existing.island } : null,
        newData: { name, island, latitude, longitude },
        changedFields: existing ? ["latitude", "longitude"] : ["name", "island", "latitude", "longitude"],
        metadata: {
          editor: "sighting_detail_modal",
          sighting_id: row?.pk_sighting_id ?? null,
        },
      });
    } catch (auditError) {
      setSaving(false);
      setSaveMessage(auditError instanceof Error ? auditError.message : "Could not write audit row.");
      return;
    }
    const { error: writeError } = await request;
    if (writeError) {
      setSaving(false);
      setSaveMessage(`Location menu was not saved: ${writeError.message}`);
      return;
    }

    const { data: verifiedLocation, error: verifyError } = await supabase
      .from("location_defaults")
      .select("name,island,latitude,longitude")
      .eq("island", island)
      .eq("name", name)
      .maybeSingle();

    setSaving(false);
    if (verifyError) {
      setSaveMessage(`Location menu may have saved, but could not be verified: ${verifyError.message}`);
      return;
    }
    if (!verifiedLocation) {
      setSaveMessage("Location menu save did not verify. Refresh before using this location.");
      return;
    }

    reloadLocations();
    setSaveMessage(`Location menu saved and verified: ${name}. Click Save Sighting to store it on this sighting.`);
  }

  async function saveSighting() {
    if (!isAdmin || !row || !sightingPatch) return;

    if (changedFields.length === 0) {
      setSaveMessage("No sighting fields changed.");
      return;
    }
    const reason = changeReason.trim();
    if (!reason) {
      setSaveMessage("Add a change reason before saving sighting changes.");
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    setError(null);

    const oldData = pickFields(row as unknown as Record<string, unknown>, changedFields);
    const newData = pickFields(sightingPatch, changedFields);

    try {
      await logDataChange({
        action: "update",
        tableName: "sightings",
        primaryKey: row.pk_sighting_id,
        recordLabel: `sighting ${row.pk_sighting_id}`,
        reason,
        oldData,
        newData,
        changedFields,
        metadata: {
          editor: "sighting_detail_modal",
          source: row.is_mprf ? "MPRF" : "HAMER",
        },
      });
    } catch (auditError) {
      setSaving(false);
      setSaveMessage(
        auditError instanceof Error
          ? auditError.message
          : "Could not write audit row. The sighting was not changed."
      );
      return;
    }

    const { error: saveError } = await supabase
      .from("sightings")
      .update(sightingPatch)
      .eq("pk_sighting_id", row.pk_sighting_id)
      .select("pk_sighting_id")
      .single();

    if (saveError) {
      setSaving(false);
      setSaveMessage(`Sighting was not saved: ${saveError.message}`);
      return;
    }

    const { data: verifiedRow, error: verifyError } = await supabase
      .from("sightings")
      .select(SIGHTING_DETAIL_COLUMNS)
      .eq("pk_sighting_id", row.pk_sighting_id)
      .single();

    setSaving(false);
    if (verifyError) {
      setSaveMessage(`Sighting may have saved, but could not be verified: ${verifyError.message}`);
      return;
    }

    const failedFields = changedFields.filter((field) =>
      auditValueChanged((verifiedRow as Record<string, unknown>)[field], sightingPatch[field as keyof typeof sightingPatch])
    );
    if (failedFields.length > 0) {
      setSaveMessage(`Sighting save did not verify for: ${failedFields.join(", ")}. Refresh before editing again.`);
      return;
    }

    setRow(verifiedRow as SightingDetail);
    setDraft(sightingToDraft(verifiedRow as SightingDetail));
    setSaveMessage(`Sighting saved at ${new Date().toLocaleTimeString()}.`);
    setSaveState("saved");
    setChangeReason("");
    onSaved({ type: "sighting_updated", sightingId: row.pk_sighting_id, changedFields });
  }

  const draftLat = numberOrNull(draft.latitude);
  const draftLon = numberOrNull(draft.longitude);
  const hasCoords = draftLat != null && draftLon != null;
  const saveButtonClass =
    saveState === "saved"
      ? "bg-slate-300 text-slate-700 opacity-60 hover:bg-slate-300"
      : hasUnsavedChanges && hasChangeReason
        ? ""
        : "bg-slate-200 text-slate-600 hover:bg-slate-200";
  const saveButtonText = saving
    ? "Saving..."
    : saveState === "saved"
      ? "Saved"
      : !hasUnsavedChanges
        ? "No Changes"
        : !hasChangeReason
          ? "Add Reason"
          : "Save Sighting";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>{sightingId ? `Sighting ${sightingId}` : "Sighting Details"}</DialogTitle>
            {isAdmin && row ? (
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded text-red-600 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={deleteSighting}
                disabled={saving || loading}
                title={`Delete sighting ${row.pk_sighting_id}`}
                aria-label={`Delete sighting ${row.pk_sighting_id}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <DialogDescription className="sr-only">
            Review and edit sighting fields, location metadata, map coordinates, notes, behavior, and linked mantas.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-sm text-slate-600">Loading sighting details...</div>
        ) : error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : row ? (
          <div className="max-h-[72vh] overflow-auto pr-1">
            <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
              <div className="space-y-4">
                {isAdmin ? (
                  <div className="rounded border bg-white p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold">Edit Sighting</div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={saveSighting}
                        disabled={saving || saveState === "saved" || !hasUnsavedChanges || !hasChangeReason}
                        className={saveButtonClass}
                      >
                        {saveButtonText}
                      </Button>
                    </div>
                    <div className="mb-3 space-y-1">
                      <Label className="text-xs font-medium uppercase text-slate-500">Change Reason</Label>
                      <Textarea
                        className="min-h-14 bg-white"
                        value={changeReason}
                        onChange={(event) => {
                          setSaveState("idle");
                          setChangeReason(event.target.value);
                        }}
                        placeholder="Required before saving. Example: verified Ulua Point coordinates from location table."
                      />
                    </div>
                    {hasUnsavedChanges ? (
                      <div className="mb-3 rounded border border-blue-100 bg-blue-50 p-2 text-sm text-blue-900">
                        Unsaved changes: {changedFields.join(", ")}. Add a change reason to enable saving.
                      </div>
                    ) : null}
                    {saveMessage ? <div className="mb-3 rounded border bg-slate-50 p-2 text-sm text-slate-700">{saveMessage}</div> : null}
                    {locationError ? <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">{locationError}</div> : null}
                    <div className="grid gap-3 text-sm sm:grid-cols-2">
                      <EditField label="Date" value={draft.sighting_date} onChange={(v) => setDraftField("sighting_date", v)} type="date" />
                      <Detail label="Source" value={row.is_mprf ? "MPRF" : "HAMER"} />
                      <EditField label="Start Time" value={draft.start_time} onChange={(v) => setDraftField("start_time", v)} />
                      <EditField label="End Time" value={draft.end_time} onChange={(v) => setDraftField("end_time", v)} />
                      <EditField label="Population" value={draft.population} onChange={(v) => setDraftField("population", v)} />
                      <EditField label="Island" value={draft.island} onChange={(v) => setDraftField("island", v)} />
                      <div className="space-y-1">
                        <Label className="text-xs font-medium uppercase text-slate-500">Known Location</Label>
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={locations.some((loc) => loc.name === draft.sitelocation) ? draft.sitelocation : ""}
                          onChange={(event) => applyKnownLocation(event.target.value)}
                          disabled={loadingLoc}
                        >
                          <option value="">{loadingLoc ? "Loading locations..." : "Choose from location menu..."}</option>
                          {locations.map((loc) => (
                            <option key={`${loc.island}-${loc.name}`} value={loc.name}>
                              {loc.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <label className="flex min-h-10 items-center gap-2 rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-800">
                        <input
                          type="checkbox"
                          checked={draft.location_unknown === "true"}
                          onChange={(event) => setDraftField("location_unknown", event.target.checked ? "true" : "false")}
                          className="h-4 w-4"
                        />
                        <span>Location unknown</span>
                      </label>
                      <EditField label="Location Name" value={draft.sitelocation} onChange={(v) => setDraftField("sitelocation", v)} />
                      <EditField label="Legacy Location" value={draft.location} onChange={(v) => setDraftField("location", v)} />
                      <EditField label="Latitude" value={draft.latitude} onChange={(v) => setDraftField("latitude", v)} />
                      <EditField label="Longitude" value={draft.longitude} onChange={(v) => setDraftField("longitude", v)} />
                      <EditField label="Photographer" value={draft.photographer} onChange={(v) => setDraftField("photographer", v)} />
                      <EditField label="Organization" value={draft.organization} onChange={(v) => setDraftField("organization", v)} />
                      <EditField label="Total Mantas" value={draft.total_mantas} onChange={(v) => setDraftField("total_mantas", v)} type="number" />
                      <Detail label="Linked Mantas" value={mantas.length} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setShowPicker(true)}>
                        Drop Pin For Lat/Lon
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={addLocationDefault} disabled={saving}>
                        Add/Update Location Menu
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <Detail label="Date" value={row.sighting_date} />
                    <Detail label="Time" value={[row.start_time, row.end_time].filter(Boolean).join(" - ") || null} />
                    <Detail label="Source" value={row.is_mprf ? "MPRF" : "HAMER"} />
                    <Detail label="Population" value={row.population} />
                    <Detail label="Island" value={row.island} />
                    <Detail label="Location" value={row.sitelocation ?? row.location} />
                    <Detail label="Location Unknown" value={row.location_unknown ? "Yes" : "No"} />
                    <Detail label="Latitude" value={row.latitude} />
                    <Detail label="Longitude" value={row.longitude} />
                    <Detail label="Photographer" value={row.photographer} />
                    <Detail label="Organization" value={row.organization} />
                    <Detail label="Total Mantas" value={row.total_mantas ?? row.total_manta_ids} />
                    <Detail label="Linked Mantas" value={mantas.length} />
                  </div>
                )}

                <div className="rounded border bg-slate-50 p-3 text-sm">
                  <div className="text-xs font-medium uppercase text-slate-500">Notes</div>
                  {isAdmin ? (
                    <Textarea className="mt-2 min-h-28 bg-white" value={draft.notes} onChange={(event) => setDraftField("notes", event.target.value)} />
                  ) : (
                    <div className="mt-1 whitespace-pre-wrap text-slate-900">
                      {row.notes?.trim() || "—"}
                    </div>
                  )}
                </div>

                {isAdmin ? (
                  <div className="rounded border bg-slate-50 p-3 text-sm">
                    <div className="text-xs font-medium uppercase text-slate-500">Behavior</div>
                    <Textarea className="mt-2 min-h-20 bg-white" value={draft.behavior} onChange={(event) => setDraftField("behavior", event.target.value)} />
                  </div>
                ) : null}

                <div className="rounded border bg-slate-50 p-3 text-sm">
                  <div className="text-xs font-medium uppercase text-slate-500">Recorded Manta Lists</div>
                  <div className="mt-2 grid gap-2">
                    <ListDetail label="list_manta_ids_2" value={row.list_manta_ids_2} />
                    <ListDetail label="list_catalog_ids" value={row.list_catalog_ids} />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded border bg-white p-3">
                  <div className="mb-2 text-sm font-semibold">Map</div>
                  {hasCoords ? (
                    <iframe
                      title={`Map for sighting ${row.pk_sighting_id}`}
                      className="h-56 w-full rounded border"
                      src={miniMapUrl(draftLat, draftLon)}
                    />
                  ) : (
                    <div className="flex h-40 items-center justify-center rounded border bg-slate-50 text-sm text-slate-600">
                      No latitude/longitude available.
                    </div>
                  )}
                </div>

                <div className="rounded border bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Linked Mantas</div>
                    <div className="flex items-center gap-2">
                      {isAdmin ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={syncSightingMantaSummaryFromModal}
                          disabled={saving}
                          title="Sync stored sighting manta fields from actual linked manta rows"
                        >
                          <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />
                          Sync Summary
                        </Button>
                      ) : null}
                      {mantas.length > 0 ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenMantas(row.pk_sighting_id)}
                        >
                          Open Manta List
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {mantas.length === 0 ? (
                    <div className="text-sm text-slate-600">No manta rows link to this sighting.</div>
                  ) : (
                    <div className="max-h-72 overflow-auto rounded border">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white">
                          <tr className="border-b text-left">
                            <th className="px-2 py-2">Manta</th>
                            <th className="px-2 py-2">Catalog</th>
                            <th className="px-2 py-2">Name</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mantas.map((m) => (
                            <tr key={m.pk_manta_id} className="border-b last:border-0">
                              <td className="px-2 py-2">
                                <span className="inline-flex items-center gap-1">
                                  {onOpenRecord ? (
                                    <button
                                      type="button"
                                      className="text-blue-600 underline hover:text-blue-700"
                                      onClick={() => onOpenRecord({ type: "manta", id: m.pk_manta_id })}
                                    >
                                      {m.pk_manta_id}
                                    </button>
                                  ) : (
                                    <Link
                                      to={`/browse/mantas?mantaId=${m.pk_manta_id}`}
                                      className="text-blue-600 underline hover:text-blue-700"
                                    >
                                      {m.pk_manta_id}
                                    </Link>
                                  )}
                                  {isAdmin ? (
                                    <button
                                      type="button"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded text-red-600 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                                      onClick={() => deleteLinkedManta(m)}
                                      disabled={saving}
                                      title={`Delete manta row ${m.pk_manta_id}`}
                                      aria-label={`Delete manta row ${m.pk_manta_id}`}
                                    >
                                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                  ) : null}
                                </span>
                              </td>
                              <td className="px-2 py-2">
                                {m.fk_catalog_id ? (
                                  onOpenRecord ? (
                                    <button
                                      type="button"
                                      className="text-blue-600 underline hover:text-blue-700"
                                      onClick={() => onOpenRecord({ type: "catalog", id: m.fk_catalog_id! })}
                                    >
                                      {m.fk_catalog_id}
                                    </button>
                                  ) : (
                                    <Link
                                      to={`/browse/catalog?catalogId=${m.fk_catalog_id}`}
                                      className="text-blue-600 underline hover:text-blue-700"
                                    >
                                      {m.fk_catalog_id}
                                    </Link>
                                  )
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="px-2 py-2">{m.name || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-600">No sighting loaded.</div>
        )}
      </DialogContent>
      <MapPickerModal
        open={showPicker}
        lat={numberOrNull(draft.latitude)}
        lng={numberOrNull(draft.longitude)}
        onClose={() => setShowPicker(false)}
        onApply={(lat, lon) => {
          setSaveState("idle");
          setDraft((prev) => ({ ...prev, latitude: lat.toFixed(6), longitude: lon.toFixed(6), location_unknown: "false" }));
          setShowPicker(false);
        }}
      />
    </Dialog>
  );
}

function sightingToDraft(row: SightingDetail): Record<string, string> {
  return {
    sighting_date: String(row.sighting_date ?? ""),
    start_time: String(row.start_time ?? ""),
    end_time: String(row.end_time ?? ""),
    population: String(row.population ?? ""),
    island: String(row.island ?? ""),
    sitelocation: String(row.sitelocation ?? row.location ?? ""),
    location: String(row.location ?? row.sitelocation ?? ""),
    location_unknown: row.location_unknown ? "true" : "false",
    latitude: row.latitude == null ? "" : String(row.latitude),
    longitude: row.longitude == null ? "" : String(row.longitude),
    photographer: String(row.photographer ?? ""),
    organization: String(row.organization ?? ""),
    total_mantas: row.total_mantas == null ? "" : String(row.total_mantas),
    notes: String(row.notes ?? ""),
    behavior: String(row.behavior ?? ""),
  };
}

function createMantaListRemovalPatch(row: SightingDetail, mantaId: number) {
  const patch: Partial<Pick<SightingDetail, "list_manta_ids" | "list_manta_ids_2">> = {};
  const idText = String(mantaId);
  for (const field of ["list_manta_ids", "list_manta_ids_2"] as const) {
    const raw = row[field];
    if (!raw?.trim()) continue;
    const ids = raw
      .split(/[,\s]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (!ids.includes(idText)) continue;
    const next = ids.filter((id) => id !== idText).join(",");
    patch[field] = next || null;
  }
  return patch;
}

function mantaRowToState(m: Record<string, any>): SightingMantaRow {
  return {
    pk_manta_id: Number(m.pk_manta_id),
    fk_catalog_id: m.fk_catalog_id == null ? null : Number(m.fk_catalog_id),
    name: m.catalog?.name ?? m.name ?? null,
    manta_name: m.name ?? null,
    gender: m.gender ?? null,
    age_class: m.age_class ?? null,
    is_mprf: m.is_mprf ?? null,
  };
}

function summaryValueChanged(field: string, oldValue: unknown, newValue: unknown) {
  if (field.startsWith("list_")) {
    return JSON.stringify(normalizeIdList(oldValue)) !== JSON.stringify(normalizeIdList(newValue));
  }
  return Number(oldValue ?? 0) !== Number(newValue ?? 0);
}

function normalizeIdList(value: unknown) {
  return String(value ?? "")
    .split(/[,\s]+/)
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isFinite(id))
    .sort((a, b) => a - b);
}

function cleanIdentityText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function createSightingPatch(draft: Record<string, string>) {
  return {
    sighting_date: emptyToNull(draft.sighting_date),
    start_time: emptyToNull(draft.start_time),
    end_time: emptyToNull(draft.end_time),
    population: emptyToNull(draft.population),
    island: emptyToNull(draft.island),
    sitelocation: emptyToNull(draft.sitelocation),
    location: emptyToNull(draft.location),
    location_unknown: draft.location_unknown === "true",
    latitude: numberOrNull(draft.latitude),
    longitude: numberOrNull(draft.longitude),
    photographer: emptyToNull(draft.photographer),
    organization: emptyToNull(draft.organization),
    total_mantas: numberOrNull(draft.total_mantas),
    notes: emptyToNull(draft.notes),
    behavior: emptyToNull(draft.behavior),
  };
}

function emptyToNull(value: string) {
  const clean = value.trim();
  return clean === "" ? null : clean;
}

function numberOrNull(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function auditValueChanged(oldValue: unknown, newValue: unknown) {
  const normalize = (value: unknown) => {
    if (value === undefined || value === "") return null;
    return value;
  };
  return JSON.stringify(normalize(oldValue)) !== JSON.stringify(normalize(newValue));
}

function pickFields(source: Record<string, unknown>, fields: string[]) {
  return fields.reduce<Record<string, unknown>>((picked, field) => {
    picked[field] = source[field];
    return picked;
  }, {});
}

function miniMapUrl(lat: number, lon: number) {
  const pad = 0.01;
  const left = lon - pad;
  const right = lon + pad;
  const bottom = lat - pad;
  const top = lat + pad;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${lat}%2C${lon}`;
}

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded border bg-slate-50 p-3">
      <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
      <div className="mt-1 break-words text-slate-900">{value ?? "—"}</div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium uppercase text-slate-500">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-white"
      />
    </div>
  );
}

function ListDetail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="font-medium text-slate-700">{label}:</span>{" "}
      <span className="break-words text-slate-900">{value?.trim() || "—"}</span>
    </div>
  );
}
