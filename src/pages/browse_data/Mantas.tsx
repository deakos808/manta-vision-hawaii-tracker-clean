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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  gender: string | null;
  age_class: string | null;
  is_mprf: boolean;
  photo_count?: number;
  best_thumb_url?: string | null;
};

type MantaFacetRow = {
  population: string | null;
  island: string | null;
  location: string | null;
  photographer: string | null;
  gender: string | null;
  age_class: string | null;
  mprf: string | null;
};

type MantaStats = {
  totalEncounters: number;
  uniqueCatalogs: number;
  males: number;
  females: number;
  adults: number;
  juveniles: number;
};

const PAGE = 500;

export default function MantasPage() {
  const isAdmin = useIsAdmin();
  const showHamrFilter = isAdmin;
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
  const [filterBasisRows, setFilterBasisRows] = useState<MantaFacetRow[]>([]);
  const [totalMantas, setTotalMantas] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Search + Filters
  const [q, setQ] = useState("");
  const [mantaIdPrefix, setMantaIdPrefix] = useState("");
  const [namePrefix, setNamePrefix] = useState("");
  const [catalogPrefix, setCatalogPrefix] = useState("");
  const [population, setPopulation] = useState<string[]>([]);
  const [island, setIsland] = useState<string[]>([]);
  const [location, setLocation] = useState<string[]>([]);
  const [photographer, setPhotographer] = useState<string[]>([]);
  const [gender, setGender] = useState<string[]>([]);
  const [ageClass, setAgeClass] = useState<string[]>([]);
  const [mprf, setMprf] = useState<string[]>([]);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState<MantaStats>({
    totalEncounters: 0,
    uniqueCatalogs: 0,
    males: 0,
    females: 0,
    adults: 0,
    juveniles: 0,
  });

  // Sort: false = newest first (desc), true = oldest first (asc)
  const [sortAsc, setSortAsc] = useState(false);
  const CARD_PAGE = 36;
  const [showing, setShowing] = useState(CARD_PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [serverFrom, setServerFrom] = useState(0);
  const prefixMode = !!mantaIdPrefix.trim() || !!namePrefix.trim() || !!catalogPrefix.trim();
  const hasActiveFilters =
    !!q.trim() ||
    !!mantaIdPrefix.trim() ||
    !!namePrefix.trim() ||
    !!catalogPrefix.trim() ||
    population.length > 0 ||
    island.length > 0 ||
    location.length > 0 ||
    photographer.length > 0 ||
    gender.length > 0 ||
    ageClass.length > 0 ||
    mprf.length > 0;

  const handleClearFilters = () => {
    setMantaIdPrefix("");
    setNamePrefix("");
    setCatalogPrefix("");
    setPopulation([]);
    setIsland([]);
    setLocation([]);
    setPhotographer([]);
    setGender([]);
    setAgeClass([]);
    setMprf([]);
    setQ("");
    setShowing(CARD_PAGE);
    setServerFrom(0);
  };

  // Reset when context changes
  useEffect(() => {
    handleClearFilters();
  }, [sightingId, crumbCatalogId]);

  const rawRowMatchesFilters = (r: any) => {
    const query = q.trim().toLowerCase();
    const mantaNeedle = mantaIdPrefix.trim();
    const nameNeedle = namePrefix.trim().toLowerCase();
    const catNeedle = catalogPrefix.trim();

    const rowName = String(r?.name ?? "").toLowerCase();
    const rowCatalogId = String(r?.fk_catalog_id ?? "");
    const rowPopulation = r?.sightings?.population ?? null;
    const rowIsland = r?.sightings?.island ?? null;
    const rowLocation = r?.sightings?.sitelocation ?? null;
    const rowPhotographer = r?.sightings?.photographer ?? r?.photographer ?? null;
    const rowGender = r?.gender ?? null;
    const rowAgeClass = r?.age_class ?? null;
    const rowIsMprf = !!r?.is_mprf;

    if (mantaNeedle && !String(r?.pk_manta_id ?? "").startsWith(mantaNeedle)) return false;
    if (nameNeedle && !rowName.startsWith(nameNeedle)) return false;
    if (catNeedle && !rowCatalogId.startsWith(catNeedle)) return false;

    if (population.length > 0 && (!rowPopulation || !population.includes(rowPopulation))) return false;
    if (island.length > 0 && (!rowIsland || !island.includes(rowIsland))) return false;
    if (location.length > 0 && (!rowLocation || !location.includes(rowLocation))) return false;
    if (photographer.length > 0 && (!rowPhotographer || !photographer.includes(rowPhotographer))) return false;
    if (gender.length > 0 && (!rowGender || !gender.includes(rowGender))) return false;
    if (ageClass.length > 0 && (!rowAgeClass || !ageClass.includes(rowAgeClass))) return false;

    if (
      mprf.length > 0 &&
      !((mprf.includes("MPRF") && rowIsMprf) || (mprf.includes("HAMER") && !rowIsMprf))
    ) {
      return false;
    }

    if (!query) return true;

    if (/^\d+$/.test(query)) {
      const id = Number(query);
      return (
        Number(r?.pk_manta_id) === id ||
        Number(r?.fk_catalog_id) === id ||
        Number(r?.fk_sighting_id) === id
      );
    }

    return (
      rowName.includes(query) ||
      String(rowLocation ?? "").toLowerCase().includes(query) ||
      String(rowPhotographer ?? "").toLowerCase().includes(query) ||
      String(rowPopulation ?? "").toLowerCase().includes(query) ||
      String(rowIsland ?? "").toLowerCase().includes(query) ||
      String(rowGender ?? "").toLowerCase().includes(query) ||
      String(rowAgeClass ?? "").toLowerCase().includes(query)
    );
  };

  async function buildEnrichedRows(rows: any[]) {
    const mantas: MantaRow[] = [];
    const mantaIds: number[] = [];
    const facets: MantaFacetRow[] = [];

    for (const r of rows) {
      const photog = r.sightings?.photographer ?? r.photographer ?? null;
      const isMprf = !!r.is_mprf;
      if (!isAdmin && isMprf) continue;

      const m: MantaRow = {
        pk_manta_id: r.pk_manta_id,
        fk_catalog_id: r.fk_catalog_id,
        fk_sighting_id: r.fk_sighting_id,
        name: r.name ?? null,
        population: r.sightings?.population ?? null,
        island: r.sightings?.island ?? null,
        location: r.sightings?.sitelocation ?? null,
        photographer: photog,
        gender: r.gender ?? null,
        age_class: r.age_class ?? null,
        is_mprf: isMprf,
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
        gender: m.gender,
        age_class: m.age_class,
        mprf: isMprf ? "MPRF" : "HAMER",
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

    return { mantas, facets };
  }

  // Load mantas (server-paged), join catalog/sightings for metadata, get best thumbs
  useEffect(() => {
    let active = true;

    async function fetchTotal() {
      let totalQ = supabase
        .from("mantas")
        .select("*", { count: "exact", head: true });

      if (sightingId) totalQ = totalQ.eq("fk_sighting_id", sightingId);
      if (crumbCatalogId) totalQ = totalQ.eq("fk_catalog_id", crumbCatalogId);

      const { count } = await totalQ;
      if (!active) return;
      setTotalMantas(count ?? 0);
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
            "name",
            "photographer",
            "gender",
            "age_class",
            "is_mprf",
            "sightings:fk_sighting_id ( population, island, sitelocation, photographer )",
          ].join(",")
        )
        .order("pk_manta_id", { ascending: false })
        .range(from, from + PAGE - 1);

      if (sightingId) q = q.eq("fk_sighting_id", sightingId);
      if (crumbCatalogId) q = q.eq("fk_catalog_id", crumbCatalogId);
      if (!isAdmin) q = q.eq("is_mprf", false);

      const { data, error } = await q;
      if (!active) return;

      if (error) {
        setError(error.message);
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const rows = (data ?? []) as any[];
      const enriched = await buildEnrichedRows(rows);

      if (!active) return;

      setAllMantas((prev) => (replace ? enriched.mantas : [...prev, ...enriched.mantas]));
      setFacetRows((prev) => (replace ? enriched.facets : [...prev, ...enriched.facets]));

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

    if (!hasActiveFilters) {
      init();
    }

    return () => {
      active = false;
    };
  }, [sightingId, crumbCatalogId, hasActiveFilters]);

  useEffect(() => {
    if (!hasActiveFilters) return;

    let active = true;

    async function runActiveFilterSearch() {
      setLoading(true);
      setError(null);
      setLoadingMore(false);
      setHasMore(false);
      setServerFrom(0);
      setShowing(CARD_PAGE);
      setAllMantas([]);
      setFacetRows([]);

      const nameNeedle = namePrefix.trim().toLowerCase();
      const pageSize = 1000;
      let from = 0;
      const matchedRows: any[] = [];

      while (true) {
        let base = supabase
          .from("mantas")
          .select(
            [
              "pk_manta_id",
              "fk_catalog_id",
              "fk_sighting_id",
              "name",
              "photographer",
              "gender",
              "age_class",
              "is_mprf",
              "sightings:fk_sighting_id ( population, island, sitelocation, photographer )",
            ].join(",")
          )
          .order("pk_manta_id", { ascending: false })
          .range(from, from + pageSize - 1);

        if (nameNeedle) base = base.ilike("name", `${nameNeedle}%`);
        if (sightingId) base = base.eq("fk_sighting_id", sightingId);
        if (crumbCatalogId) base = base.eq("fk_catalog_id", crumbCatalogId);
        if (!isAdmin) base = base.eq("is_mprf", false);

        const { data, error } = await base;
        if (!active) return;

        if (error) {
          setError(error.message);
          setLoading(false);
          return;
        }

        const chunk = (data ?? []) as any[];
        matchedRows.push(...chunk.filter(rawRowMatchesFilters));

        if (chunk.length < pageSize) break;
        from += pageSize;
      }

      if (!active) return;

      if (matchedRows.length === 0) {
        setAllMantas([]);
        setFacetRows([]);
        setLoading(false);
        return;
      }

      const uniq = new Map<number, any>();
      for (const row of matchedRows) {
        uniq.set(Number((row as any).pk_manta_id), row);
      }

      const enriched = await buildEnrichedRows(Array.from(uniq.values()));

      if (!active) return;

      setAllMantas(enriched.mantas);
      setFacetRows(enriched.facets);
      setLoading(false);
    }

    runActiveFilterSearch();

    return () => {
      active = false;
    };
  }, [
    hasActiveFilters,
    q,
    mantaIdPrefix,
    namePrefix,
    catalogPrefix,
    population,
    island,
    location,
    photographer,
    gender,
    ageClass,
    mprf,
    sightingId,
    crumbCatalogId,
  ]);

  // Client-side search & filters
  const filteredMantas = useMemo(() => {
    const query = q.trim().toLowerCase();

    return allMantas.filter((m) => {
      const mantaNeedle = mantaIdPrefix.trim();
      const nameNeedle = namePrefix.trim().toLowerCase();
      const catNeedle = catalogPrefix.trim().toLowerCase();

      const mantaIdOk = !mantaNeedle || String(m.pk_manta_id ?? "").startsWith(mantaNeedle);

      const nameOk =
        !nameNeedle ||
        String(m.name ?? "").toLowerCase().startsWith(nameNeedle);

      const catalogIdOk =
        !catNeedle ||
        String(m.fk_catalog_id ?? "").toLowerCase().startsWith(catNeedle);

      const popOk = population.length === 0 || (m.population && population.includes(m.population));
      const islOk = island.length === 0 || (m.island && island.includes(m.island));
      const locOk = location.length === 0 || (m.location && location.includes(m.location));
      const phoOk = photographer.length === 0 || (m.photographer && photographer.includes(m.photographer));
      const genOk = gender.length === 0 || (m.gender && gender.includes(m.gender));
      const ageOk = ageClass.length === 0 || (m.age_class && ageClass.includes(m.age_class));
      const mprfOk =
        mprf.length === 0 ||
        (mprf.includes("MPRF") && m.is_mprf) ||
        (mprf.includes("HAMER") && !m.is_mprf);

      if (!(mantaIdOk && nameOk && catalogIdOk && popOk && islOk && locOk && phoOk && genOk && ageOk && mprfOk)) return false;

      if (!query) return true;
      if (/^\d+$/.test(query)) {
        const id = Number(query);
        return m.pk_manta_id === id || m.fk_catalog_id === id || m.fk_sighting_id === id;
      }
      return (
        (m.name ?? "").toLowerCase().includes(query) ||
        (m.location ?? "").toLowerCase().includes(query) ||
        (m.photographer ?? "").toLowerCase().includes(query) ||
        (m.population ?? "").toLowerCase().includes(query) ||
        (m.island ?? "").toLowerCase().includes(query) ||
        (m.gender ?? "").toLowerCase().includes(query) ||
        (m.age_class ?? "").toLowerCase().includes(query)
      );
    });
  }, [allMantas, q, mantaIdPrefix, namePrefix, catalogPrefix, population, island, location, photographer, gender, ageClass, mprf]);

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
    if (mantaIdPrefix.trim()) parts.push(`Manta ID starts with "${mantaIdPrefix.trim()}"`);
    if (namePrefix.trim()) parts.push(`Name starts with "${namePrefix.trim()}"`);
    if (catalogPrefix.trim()) parts.push(`Catalog ID starts with "${catalogPrefix.trim()}"`);
    if (population.length) parts.push(`Population: ${population.join(", ")}`);
    if (island.length) parts.push(`Island: ${island.join(", ")}`);
    if (location.length) parts.push(`Location: ${location.join(", ")}`);
    if (photographer.length) parts.push(`Photographer: ${photographer.join(", ")}`);
    if (gender.length) parts.push(`Gender: ${gender.join(", ")}`);
    if (ageClass.length) parts.push(`Age Class: ${ageClass.join(", ")}`);
    if (mprf.length) parts.push(`MPRF: ${mprf.join(", ")}`);
    return parts.join(" · ");
  }, [q, mantaIdPrefix, namePrefix, catalogPrefix, population, island, location, photographer, gender, ageClass, mprf]);

  // Infinite scroll:
  // 1) increases visible slice (UI paging)
  // 2) triggers server pagination when nearing the end of loaded data
  useEffect(() => {
    if (hasActiveFilters) return;

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
                  "gender",
                  "age_class",
                  "catalog:fk_catalog_id ( name )",
                  "sightings:fk_sighting_id ( population, island, sitelocation, photographer )",
                ].join(",")
              )
              .order("pk_manta_id", { ascending: false })
              .range(serverFrom, serverFrom + PAGE - 1);

            if (sightingId) q = q.eq("fk_sighting_id", sightingId);
            if (crumbCatalogId) q = q.eq("fk_catalog_id", crumbCatalogId);
            if (!isAdmin) q = q.eq("is_mprf", false);

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

            const enriched = await buildEnrichedRows(rows);

            setAllMantas((prev) => [...prev, ...enriched.mantas]);
            setFacetRows((prev) => [...prev, ...enriched.facets]);

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
  }, [hasActiveFilters, showing, sortedMantas.length, loadingMore, hasMore, serverFrom, sightingId, crumbCatalogId]);
  const resultsLine = useMemo(() => {
    let base = `Showing ${filteredMantas.length} of ${totalMantas} total records`;

    if (activeFiltersText) {
      base += `, filtered by ${activeFiltersText}`;
    }

    return base;
  }, [filteredMantas.length, totalMantas, activeFiltersText]);

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

  useEffect(() => {
    let alive = true;

    async function loadFilterBasis() {
      let from = 0;
      const pageSize = 1000;
      const rows: MantaFacetRow[] = [];

      while (true) {
        let q = supabase
          .from("mantas")
          .select(
            [
              "population:sightings!fk_mantas_sightings ( population )",
              "island:sightings!fk_mantas_sightings ( island )",
              "location:sightings!fk_mantas_sightings ( sitelocation )",
              "photographer:sightings!fk_mantas_sightings ( photographer )",
              "gender",
              "age_class",
              "is_mprf",
            ].join(",")
          )
          .range(from, from + pageSize - 1);

        if (sightingId) q = q.eq("fk_sighting_id", sightingId);
        if (crumbCatalogId) q = q.eq("fk_catalog_id", crumbCatalogId);

        const { data, error } = await q;
        if (!alive) return;
        if (error) {
          console.warn("[Mantas] filter basis load failed", error.message);
          break;
        }

        const chunk = (data ?? []).map((r: any) => ({
          population: r.population?.population ?? null,
          island: r.island?.island ?? null,
          location: r.location?.sitelocation ?? null,
          photographer: r.photographer?.photographer ?? null,
          gender: r.gender ?? null,
          age_class: r.age_class ?? null,
          mprf: r.is_mprf ? "MPRF" : "HAMER",
        })) as MantaFacetRow[];

        rows.push(...chunk);

        if ((data ?? []).length < pageSize) break;
        from += pageSize;
      }

      if (!alive) return;
      setFilterBasisRows(rows);
    }

    async function loadStats() {
      const [
        encountersRes,
        uniqueRes,
        malesRes,
        femalesRes,
        adultsRes,
        juvenilesRes,
      ] = await Promise.all([
        supabase.from("mantas").select("*", { count: "exact", head: true }),
        supabase.from("catalog_with_photo_view").select("*", { count: "exact", head: true }),
        supabase.from("catalog_with_photo_view").select("*", { count: "exact", head: true }).eq("gender", "Male"),
        supabase.from("catalog_with_photo_view").select("*", { count: "exact", head: true }).eq("gender", "Female"),
        supabase.from("catalog_with_photo_view").select("*", { count: "exact", head: true }).eq("age_class", "Adult"),
        supabase.from("catalog_with_photo_view").select("*", { count: "exact", head: true }).eq("age_class", "Juvenile"),
      ]);

      if (!alive) return;

      setStats({
        totalEncounters: encountersRes.count ?? 0,
        uniqueCatalogs: uniqueRes.count ?? 0,
        males: malesRes.count ?? 0,
        females: femalesRes.count ?? 0,
        adults: adultsRes.count ?? 0,
        juveniles: juvenilesRes.count ?? 0,
      });
    }

    loadFilterBasis();
    loadStats();

    return () => {
      alive = false;
    };
  }, [sightingId, crumbCatalogId]);

  return (
    <Layout>
      <div className="px-4 sm:px-6 lg:px-12 pb-12">
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

          
          <MantaFilterBox
            rows={filterBasisRows}
            mantaIdPrefix={mantaIdPrefix}
            setMantaIdPrefix={setMantaIdPrefix}
            namePrefix={namePrefix}
            setNamePrefix={setNamePrefix}
            catalogPrefix={catalogPrefix}
            setCatalogPrefix={setCatalogPrefix}
            population={population}
            setPopulation={setPopulation}
            island={island}
            setIsland={setIsland}
            location={location}
            setLocation={setLocation}
            photographer={photographer}
            setPhotographer={setPhotographer}
            gender={gender}
            setGender={setGender}
            ageClass={ageClass}
            setAgeClass={setAgeClass}
            mprf={mprf}
            setMprf={setMprf}
            onClear={handleClearFilters}
            onOpenStats={() => setShowStats(true)}
          
            showHamrFilter={showHamrFilter}
            hamrLabel="HAMER"
          />

          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700 mt-1">
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

          <div className="mt-3 text-sm text-gray-700">
            {resultsLine}
          </div>
        </div>

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
                        <div>
                          <span className="text-muted-foreground">Gender:</span>{" "}
                          {m.gender ?? "—"}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Age Class:</span>{" "}
                          {m.age_class ?? "—"}
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

      <Dialog open={showStats} onOpenChange={setShowStats}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Mantas Stats</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border p-3 bg-slate-50">
              <div className="text-muted-foreground">Total Manta Encounters</div>
              <div className="mt-1 text-2xl font-semibold">{stats.totalEncounters}</div>
            </div>
            <div className="rounded-lg border p-3 bg-slate-50">
              <div className="text-muted-foreground">Total Unique Manta Rays</div>
              <div className="mt-1 text-2xl font-semibold">{stats.uniqueCatalogs}</div>
            </div>
            <div className="rounded-lg border p-3 bg-slate-50">
              <div className="text-muted-foreground">Male</div>
              <div className="mt-1 text-2xl font-semibold">{stats.males}</div>
            </div>
            <div className="rounded-lg border p-3 bg-slate-50">
              <div className="text-muted-foreground">Female</div>
              <div className="mt-1 text-2xl font-semibold">{stats.females}</div>
            </div>
            <div className="rounded-lg border p-3 bg-slate-50">
              <div className="text-muted-foreground">Adult</div>
              <div className="mt-1 text-2xl font-semibold">{stats.adults}</div>
            </div>
            <div className="rounded-lg border p-3 bg-slate-50">
              <div className="text-muted-foreground">Juvenile</div>
              <div className="mt-1 text-2xl font-semibold">{stats.juveniles}</div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Photos modal */}
      <MantaPhotosViewer open={showPhotos} onOpenChange={setShowPhotos} mantaId={photosFor?.mantaId ?? null}  onCount={(id,n)=>setPhotoCounts(c=>({...c,[id]:n}))} />
    </Layout>
  );
}
