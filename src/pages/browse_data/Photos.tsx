import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from '@/lib/supabase';
import { Link, useSearchParams } from "react-router-dom";
import { deletePhoto } from "@/lib/adminApi";
import Layout from "@/components/layout/Layout";
import BackToTopButton from "@/components/browse/BackToTopButton";
import { ChevronUp } from "lucide-react";
import PhotoFilterBox from "@/components/photos/PhotoFilterBox";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
type FiltersState = {
  population: string[];
  island: string[];
  location: string[];
  view: string[];
  flag: string[];
  mprf: string[];
};

const POPULATIONS = ["Big Island", "Maui Nui", "Oahu", "Kauai"];
const VIEWS = ["ventral", "dorsal", "other"];

interface Photo {
  pk_photo_id: number;
  pk_photo_uuid: string;
  fk_manta_id: number | null;
  fk_manta_uuid: string | null;
  fk_catalog_id: number | null;
  fk_catalog_uuid: string | null;
  fk_sighting_id: number | null;
  file_name2: string;
  is_best_catalog_ventral_photo?: boolean | null;
  is_best_manta_ventral_photo?: boolean | null; // <- will be hydrated from base table
  is_best_catalog_dorsal_photo?: boolean | null;
  is_best_manta_dorsal_photo?: boolean | null;
  uploaded_at?: string;
  notes?: string;
  storage_path?: string;
  thumbnail_url?: string;
  photo_view: "ventral" | "dorsal" | "other";
  population?: string | null;
  photographer?: string | null;
  catalog_name?: string | null;
  island?: string | null;
  location?: string | null;
  mprf?: "MPRF" | "Non-MPRF" | null;
}

const PAGE_SIZE = 80;

export default function PhotosPage() {
const [searchParams] = useSearchParams();
  const mantaIdParam = searchParams.get("mantaId");
  const catalogIdParam = searchParams.get("catalogId");
  const sightingIdParam = searchParams.get("sightingId");

  const [fullRows, setFullRows] = useState<Array<{pk_photo_id:number|null; population:string|null; island:string|null; location:string|null; photo_view:string|null; species?:string|null; fk_sighting_id?:number|null; mprf?:string|null}>>([]);
  const [mprfRows, setMprfRows] = useState<Array<{mprf:string|null}>>([]);
const [photos, setPhotos] = useState<Photo[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [filters, setFilters] = useState<FiltersState>({
    population: [],
    island: [],
    location: [],
    view: [],
    flag: [],
    mprf: [],
  });

  // Sightings-driven option lists (islands + per-island locations)
  const [islandOptionsAll, setIslandOptionsAll] = useState<string[]>([]);
  const [locationsByIsland, setLocationsByIsland] = useState<Record<string,string[]>>({});
  const [speciesOptionsAll, setSpeciesOptionsAll] = useState<string[]>([]);

  const [search, setSearch] = useState("");
  const [catalogPrefix, setCatalogPrefix] = useState("");
  const [namePrefix, setNamePrefix] = useState("");

  // Admin role gate for update buttons
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsAdmin(false); return; }
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      const role = data?.role ?? null;
      setIsAdmin(role === "admin" || role === "database_manager");
    } catch { setIsAdmin(false); }
  })(); }, []);
  const [sortAsc, setSortAsc] = useState(true);
  const [totalCount, setTotalCount] = useState<number>(0);

  const loadingRef = useRef<HTMLDivElement>(null);
  const [lastQuery, setLastQuery] = useState<string>("");
  const requestSeq = useRef(0);
  const prefixMode = !!catalogPrefix.trim() || !!namePrefix.trim();

  // Modal state for choosing a new best manta ventral
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMantaId, setPickerMantaId] = useState<number | null>(null);
  const [pickerItems, setPickerItems] = useState<Photo[]>([]);
  const [pickerSelectedId, setPickerSelectedId] = useState<number | null>(null);
  const [pickerSaving, setPickerSaving] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  async function fetchPhotoIdsByFlags(selected: string[]) {
    if (!selected.length) return null;

    const ids: number[] = [];
    const BATCH = 1000;
    let from = 0;

    while (true) {
      let q = supabase
        .from("photos")
        .select("pk_photo_id,is_best_catalog_ventral_photo,is_best_manta_ventral_photo")
        .order("pk_photo_id", { ascending: true })
        .range(from, from + BATCH - 1);

      if (selected.includes("best_catalog") && selected.includes("best_manta")) {
        q = q.or("is_best_catalog_ventral_photo.eq.true,is_best_manta_ventral_photo.eq.true");
      } else if (selected.includes("best_catalog")) {
        q = q.eq("is_best_catalog_ventral_photo", true);
      } else if (selected.includes("best_manta")) {
        q = q.eq("is_best_manta_ventral_photo", true);
      }

      const { data, error } = await q;
      if (error) {
        console.error("[Photos] flag ids fetch error:", error);
        break;
      }

      ids.push(
        ...(data ?? [])
          .map((r: any) => Number(r.pk_photo_id))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      );

      if ((data ?? []).length < BATCH) break;
      from += BATCH;
    }

    return Array.from(new Set(ids));
  }

  async function fetchSightingIdsByMprf(selected: string[]) {
    if (!selected.length || selected.length === 2) return null;

    const wantMprf = selected.includes("MPRF");
    const ids: number[] = [];
    const BATCH = 1000;
    let from = 0;

    while (true) {
      let q = supabase
        .from("sightings")
        .select("pk_sighting_id,is_mprf")
        .order("pk_sighting_id", { ascending: true })
        .range(from, from + BATCH - 1);

      q = wantMprf ? q.eq("is_mprf", true) : q.or("is_mprf.is.false,is_mprf.is.null");

      const { data, error } = await q;
      if (error) {
        console.error("[Photos] mprf ids fetch error:", error);
        break;
      }

      ids.push(
        ...(data ?? [])
          .map((r: any) => Number(r.pk_sighting_id))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      );

      if ((data ?? []).length < BATCH) break;
      from += BATCH;
    }

    return Array.from(new Set(ids));
  }

  async function fetchMprfBySightingIds(inputIds: number[]) {
    const ids = Array.from(new Set(inputIds.filter((n) => Number.isFinite(n) && n > 0)));
    const map = new Map<number, boolean>();
    if (!ids.length) return map;

    const BATCH = 1000;
    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH);
      const { data, error } = await supabase
        .from("sightings")
        .select("pk_sighting_id,is_mprf")
        .in("pk_sighting_id", slice);

      if (error) {
        console.error("[Photos] mprf basis fetch error:", error);
        continue;
      }

      (data ?? []).forEach((r: any) => {
        map.set(Number(r.pk_sighting_id), !!r.is_mprf);
      });
    }

    return map;
  }

  // ---- Query builder: scoping + filters -----------------------------------
  function applySupabaseFilters(query: any) {
    const mantaId = mantaIdParam ? Number(mantaIdParam) : null;
    const catalogId = catalogIdParam ? Number(catalogIdParam) : null;
    const sightingId = sightingIdParam ? Number(sightingIdParam) : null;

    if (mantaId) query = query.eq("fk_manta_id", mantaId);
    if (sightingId) query = query.eq("fk_sighting_id", sightingId);
    if (!mantaId && catalogId) query = query.eq("fk_catalog_id", catalogId);

    if (search && search.trim() !== "") {
      const searchTrimmed = search.trim();
      const searchInt = parseInt(searchTrimmed, 10);
      let searchOr: string[] = [];
      if (!isNaN(searchInt) && searchInt.toString() === searchTrimmed) {
        searchOr = [
          `pk_photo_id.eq.${searchInt}`,
          `fk_catalog_id.eq.${searchInt}`,
          `fk_sighting_id.eq.${searchInt}`,
          `fk_manta_id.eq.${searchInt}`,
          `catalog_name.ilike.%${searchTrimmed}%`,
          `photographer.ilike.%${searchTrimmed}%`,
          `file_name2.ilike.%${searchTrimmed}%`,
        ];
      } else {
        searchOr = [
          `catalog_name.ilike.%${searchTrimmed}%`,
          `photographer.ilike.%${searchTrimmed}%`,
          `file_name2.ilike.%${searchTrimmed}%`,
        ];
      }
      query = query.or(searchOr.join(","));
    }

    if (namePrefix.trim()) {
      query = query.ilike("catalog_name", `${namePrefix.trim()}%`);
    }

    if (filters.view.length > 0) query = query.in("photo_view", filters.view);
    if (filters.population.length > 0) query = query.in("population", filters.population);
    if (filters.island.length > 0) query = query.in("island", filters.island);
    if (filters.location.length > 0) query = query.in("location", filters.location);
    return query;
  }

  const fetchPhotos = useCallback(
    async (reset: boolean = false) => {
      const reqId = ++requestSeq.current;

      let query = supabase
        .from("photos_with_photo_view")
        .select("*", { count: "exact" });

      query = applySupabaseFilters(query);

      if (filters.flag.length > 0) {
        const photoIds = await fetchPhotoIdsByFlags(filters.flag);
        if (reqId !== requestSeq.current) return;

        if (photoIds && photoIds.length > 0) {
          query = query.in("pk_photo_id", photoIds);
        } else if (photoIds) {
          query = query.eq("pk_photo_id", -1);
        }
      }

      if (filters.mprf.length > 0) {
        const sightingIds = await fetchSightingIdsByMprf(filters.mprf);
        if (reqId !== requestSeq.current) return;

        if (sightingIds && sightingIds.length > 0) {
          query = query.in("fk_sighting_id", sightingIds);
        } else if (sightingIds) {
          query = query.eq("fk_sighting_id", -1);
        }
      }

      query = query.order("pk_photo_id", { ascending: sortAsc });

      const from = reset ? 0 : page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (reqId !== requestSeq.current) return;

      if (error) {
        console.error("Photo fetch error:", error);
        return;
      }

      let incoming = (data ?? []) as Photo[];

      if (catalogPrefix.trim()) {
        const needle = catalogPrefix.trim();
        incoming = incoming.filter((p) => String(p.fk_catalog_id ?? "").startsWith(needle));
      }

      const mprfMap = await fetchMprfBySightingIds(
        incoming.map((p) => Number(p.fk_sighting_id ?? 0))
      );
      if (reqId !== requestSeq.current) return;

      incoming = incoming.map((p) => ({
        ...p,
        mprf: mprfMap.get(Number(p.fk_sighting_id ?? 0)) ? "MPRF" : "Non-MPRF",
      }));

      if (filters.mprf.length > 0) {
        incoming = incoming.filter((p) => p.mprf && filters.mprf.includes(p.mprf));
      }

      // HYDRATE: get is_best_manta_ventral_photo from the base table.
      const ids = incoming.map((p) => p.pk_photo_id);
      if (ids.length) {
        const { data: flags, error: flagErr } = await supabase
          .from("photos")
          .select("pk_photo_id,is_best_manta_ventral_photo")
          .in("pk_photo_id", ids);
        if (reqId !== requestSeq.current) return;

        if (!flagErr) {
          const flagMap = new Map<number, boolean>();
          (flags ?? []).forEach((r: any) =>
            flagMap.set(r.pk_photo_id as number, !!r.is_best_manta_ventral_photo)
          );
          incoming.forEach((p) => {
            if (flagMap.has(p.pk_photo_id)) {
              p.is_best_manta_ventral_photo = flagMap.get(p.pk_photo_id)!;
            }
          });
        }
      }

      if (reset) {
        setPhotos(incoming);
        setPage(1);
        setHasMore(incoming.length >= PAGE_SIZE && !prefixMode);
        setTotalCount(count ?? incoming.length);
      } else {
        setPhotos((prev) => {
          const seen = new Set<number>(prev.map((p) => p.pk_photo_id));
          const merged = [...prev];
          for (const row of incoming) {
            if (!seen.has(row.pk_photo_id)) {
              seen.add(row.pk_photo_id);
              merged.push(row);
            } else {
              const idx = merged.findIndex((x) => x.pk_photo_id === row.pk_photo_id);
              if (idx >= 0) merged[idx] = { ...merged[idx], ...row };
            }
          }
          return merged;
        });
        setPage((prev) => prev + 1);
        setHasMore(incoming.length >= PAGE_SIZE && !prefixMode);
        setTotalCount(count ?? 0);
      }
    },
    [
      search,
      catalogPrefix,
      namePrefix,
      filters,
      sortAsc,
      page,
      mantaIdParam,
      catalogIdParam,
      sightingIdParam,
      prefixMode,
    ]
  );

  // Reset paging when inputs change
  useEffect(() => {
    const queryKey = JSON.stringify({
      search,
      catalogPrefix,
      namePrefix,
      filters,
      sortAsc,
      mantaIdParam,
      catalogIdParam,
      sightingIdParam,
    });
    if (queryKey !== lastQuery) {
      requestSeq.current += 1;
      setLastQuery(queryKey);
      setPhotos([]);
      setPage(0);
      setHasMore(!prefixMode);
      fetchPhotos(true);
    }
    // eslint-disable-next-line
  }, [search, catalogPrefix, namePrefix, filters, sortAsc, mantaIdParam, catalogIdParam, sightingIdParam]);

  // Infinite scroll
  useEffect(() => {
    if (prefixMode) return;
    if (!hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (!hasMore) return;
        if (loadingMore) return;
        setLoadingMore(true);
        Promise.resolve(fetchPhotos(false)).finally(() => setLoadingMore(false));
      },
      { threshold: 1 }
    );
    if (loadingRef.current) obs.observe(loadingRef.current);
    return () => obs.disconnect();
  }, [prefixMode, hasMore, fetchPhotos, loadingMore]);

  const onClearFilters = () => {
    setSearch("");
    setCatalogPrefix("");
    setNamePrefix("");
    setFilters({
      population: [],
      island: [],
      location: [],
      view: [],
      flag: [],
      mprf: [],
    });
  };

  function filterSummary() {
    const f: string[] = [];
    if (mantaIdParam || catalogIdParam || sightingIdParam) f.push("Scoped");
    if (search) f.push(`Search: "${search}"`);
    if (catalogPrefix) f.push(`Catalog ID starts with "${catalogPrefix}"`);
    if (namePrefix) f.push(`Name starts with "${namePrefix}"`);
    if (filters.view.length) f.push(`View: ${filters.view.join(", ")}`);
    if (filters.flag.length) f.push(`Flags: ${filters.flag.join(", ")}`);
    if (filters.mprf.length) f.push(`MPRF: ${filters.mprf.join(", ")}`);
    if (filters.population.length) f.push(`Population: ${filters.population.join(", ")}`);
    if (filters.island.length) f.push(`Island: ${filters.island.join(", ")}`);
    if (filters.location.length) f.push(`Location: ${filters.location.join(", ")}`);
    return f.join(", ");
  }

  const photoRows = photos.filter((r) => r && typeof r === "object");

  // Build breadcrumb link back to Mantas
  const backQS = new URLSearchParams();
  if (sightingIdParam) backQS.set("sightingId", String(Number(sightingIdParam)));
  if (catalogIdParam) backQS.set("catalogId", String(Number(catalogIdParam)));
  const backToMantasHref =
    `/browse/mantas${backQS.toString() ? `?${backQS.toString()}` : ""}` +
    (mantaIdParam ? `#m${Number(mantaIdParam)}` : "");

  // ----- Best picker modal handlers ----------------------------------------
  async function openBestPicker(mantaId: number) {
    setPickerError(null);
    setPickerMantaId(mantaId);

    // Load ALL ventral photos for this manta (across sightings)
    const { data, error } = await supabase
      .from("photos_with_photo_view")
      .select("*")
      .eq("fk_manta_id", mantaId)
      .eq("photo_view", "ventral")
      .order("pk_photo_id", { ascending: true });

    if (error) {
      setPickerError(error.message);
      setPickerItems([]);
      setPickerSelectedId(null);
      setPickerOpen(true);
      return;
    }

    const items = (data ?? []) as Photo[];
    setPickerItems(items);

    // Preselect current best from base table
    const { data: bestRows } = await supabase
      .from("photos")
      .select("pk_photo_id")
      .eq("fk_manta_id", mantaId)
      .eq("is_best_manta_ventral_photo", true)
      .limit(1);

    setPickerSelectedId(bestRows?.[0]?.pk_photo_id ?? null);
    setPickerOpen(true);
  }

  async function saveNewBest() {
    if (!pickerMantaId || !pickerSelectedId) {
      setPickerOpen(false);
      return;
    }
    setPickerSaving(true);
    setPickerError(null);

    const { error: e1 } = await supabase
      .from("photos")
      .update({ is_best_manta_ventral_photo: false })
      .eq("fk_manta_id", pickerMantaId);
    if (e1) {
      setPickerSaving(false);
      setPickerError(e1.message);
      return;
    }

    const { error: e2 } = await supabase
      .from("photos")
      .update({ is_best_manta_ventral_photo: true })
      .eq("pk_photo_id", pickerSelectedId);
    if (e2) {
      setPickerSaving(false);
      setPickerError(e2.message);
      return;
    }

    // Update local grid flags for visible ventral photos of this manta
    setPhotos((prev) =>
      prev.map((p) =>
        p.fk_manta_id === pickerMantaId && p.photo_view === "ventral"
          ? { ...p, is_best_manta_ventral_photo: p.pk_photo_id === pickerSelectedId }
          : p
      )
    );

    // Update modal list
    setPickerItems((prev) =>
      prev.map((p) => ({
        ...p,
        is_best_manta_ventral_photo: p.pk_photo_id === pickerSelectedId,
      }))
    );

    setPickerSaving(false);
    setPickerOpen(false);
  }

  // Load distinct islands and locations from SIGHTINGS (for pill options)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Distinct islands
        const { data: isl, error: e1 } = await supabase
          .from("sightings")
          .select("island")
          .not("island","is", null);
        if (!alive) return;
        const islands = Array.from(
          new Set((isl ?? []).map(r => (r.island ?? "").toString().trim()).filter(Boolean))
        ).sort((a,b)=>a.localeCompare(b));
        setIslandOptionsAll(islands);

        // Distinct locations grouped by island
        const { data: locs, error: e2 } = await supabase
          .from("sightings")
          .select("island,sitelocation")
          .not("island","is", null)
          .not("sitelocation","is", null);
        if (!alive) return;

        const map = {};
        (locs ?? []).forEach(r => {
          const isl = (r.island ?? "").toString().trim();
          const loc = (r.sitelocation ?? "").toString().trim();
          if (!isl || !loc) return;
          if (!map[isl]) map[isl] = [];
          if (!map[isl].includes(loc)) map[isl].push(loc);
        });
        Object.values(map).forEach(arr => arr.sort((a,b)=>a.localeCompare(b)));
        setLocationsByIsland(map);
      } catch {
        // no-op
      }
    })();
    return () => { alive = false; };
  }, []);



  // Load minimal full dataset for pill counts (independent of paged display)
  useEffect(function loadPillBasis() {
    let alive = true;
    (async () => {
      const BATCH = 1000;
      let from = 0;
      const rows: Array<{pk_photo_id:number|null; population:string|null; island:string|null; location:string|null; photo_view:string|null; species:string|null; fk_sighting_id:number|null; mprf:string|null}> = [];

      while (true) {
        const to = from + BATCH - 1;
        const { data, error } = await supabase
          .from("photos_with_photo_view")
          .select("pk_photo_id,population,island,location,photo_view,fk_sighting_id")
          .range(from, to);

        if (!alive) return;
        if (error) {
          console.error("[Photos] pill-basis error:", error);
          break;
        }

        const ids = (data ?? [])
          .map((r: any) => Number(r.fk_sighting_id ?? 0))
          .filter((n: number) => Number.isFinite(n) && n > 0);

        const mprfMap = await fetchMprfBySightingIds(ids);
        if (!alive) return;

        const chunk = (data ?? []).map((r: any) => {
          const sid = Number(r.fk_sighting_id ?? 0);
          return {
            pk_photo_id: Number(r.pk_photo_id ?? 0) || null,
            population: r.population ?? null,
            island: r.island ?? null,
            location: r.location ?? null,
            photo_view: r.photo_view ?? null,
            species: null,
            fk_sighting_id: Number.isFinite(sid) && sid > 0 ? sid : null,
            mprf: mprfMap.get(sid) ? "MPRF" : "Non-MPRF",
          };
        });

        rows.push(...chunk);

        if ((data ?? []).length < BATCH) break;
        from += BATCH;
      }

      const dedup = new Map<number, any>();
      for (const row of rows) {
        const id = Number(row.pk_photo_id ?? 0);
        if (id > 0 && !dedup.has(id)) dedup.set(id, row);
      }

      setFullRows(Array.from(dedup.values()));
    })();
    return () => { alive = false; };
  }, []);

  // Species-aware, chunked loader for pill-basis (photos_pill_basis)
  useEffect(function loadPillBasis() {
    let alive = true;
    (async () => {
      const BATCH = 1000;
      let from = 0;
      const rows: Array<{population:string|null; island:string|null; location:string|null; photo_view:string|null; species:string|null}> = [];
      while (true) {
        const to = from + BATCH - 1;
        const { data, error } = await supabase
          .from("photos_pill_basis")
          .select("population,island,location,photo_view,species")
          .range(from, to);
        if (!alive) return;
        if (error) { console.error("[Photos] pill-basis error:", error); break; }

        const chunk = (data ?? []).map((r: any) => ({
          population: r.population ?? null,
          island:     r.island ?? null,
          location:   r.location ?? null,
          photo_view: r.photo_view ?? null,
          species:    r.species ?? null,
        }));

        rows.push(...chunk);
        if (chunk.length < BATCH) break;
        from += BATCH;
      }
      setFullRows(rows);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <Layout title="Photos">
      <div className="p-4">
        <div className="text-center mb-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-md py-6">
            Photos
          </h1>
        </div>

        <div>
            <Link to={backToMantasHref} className="underline">
            </Link>

        </div>

        
      <div className="bg-blue-50 px-4 sm:px-8 lg:px-16 py-4 shadow-sm -mt-2">
        <div className="mb-4 text-sm text-blue-600 text-left space-y-1">
          <div>
            <Link to="/browse/data" className="underline">← Return to Browse Data</Link>
          </div>

        {/* Filter box */}          
          <div className="mb-3">
            <input
              className="w-full sm:w-96 max-w-md bg-white border rounded px-3 py-2 text-sm"
              placeholder="Search by photo ID, catalog ID, name, or photographer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        <PhotoFilterBox
          rows={fullRows}
          filters={filters}
          setFilters={setFilters}
          onClearAll={onClearFilters}
          search={search}
          setSearch={setSearch}
          catalogPrefix={catalogPrefix}
          setCatalogPrefix={setCatalogPrefix}
          namePrefix={namePrefix}
          setNamePrefix={setNamePrefix}
          islandOptionsAll={islandOptionsAll}
          locationsByIsland={locationsByIsland}
          speciesOptionsAll={speciesOptionsAll}
          hideSearch={true}
          sortAsc={sortAsc}
          setSortAsc={setSortAsc}
        />
        </div>

        {/* Sort row (Catalog style) */}
      </div>
  <p className="mb-4 text-sm text-muted-foreground">
          Showing {photoRows.length} of {totalCount} total records{filterSummary() ? `, filtered by ${filterSummary()}` : ""}
        </p>

        {photoRows.length === 0 ? (
          <p className="text-center text-gray-500">No results found.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
            {photoRows.map((photo, index) => (
              <div key={photo.pk_photo_id} className="border rounded p-2">
                <img
                  src={photo.thumbnail_url || "/manta-logo.svg"}
                  alt="manta thumbnail"
                  className="w-full h-[140px] object-cover rounded"
                  loading="lazy"
                  decoding="async"
                  onError={(e) => ((e.target as HTMLImageElement).src = "/manta-logo.svg")}
                />
                <div className="mt-2 text-xs leading-5">
                  <div className="font-semibold text-sky-700">{photo.catalog_name ?? "—"}</div>
                  <p><strong>Catalog ID:</strong> {photo.fk_catalog_id ?? "n/a"}</p>
                  <p><strong>Sighting ID:</strong> {photo.fk_sighting_id ?? "n/a"}</p>
                  <p><strong>Manta ID:</strong> {photo.fk_manta_id ?? "n/a"}</p>
                  <p><strong>Photo ID:</strong> {photo.pk_photo_id}</p>
                  <p><strong>Photographer:</strong> {photo.photographer ?? "n/a"}</p>
                  {isAdmin ? (
  <div className="mt-1 text-xs">
    <label className="mr-2 font-semibold">View:</label>
    <select
      className="border rounded px-2 py-1 text-xs"
      value={(photo.photo_view ?? '').toString().toLowerCase()}
      onChange={async (e) => {
        const newVal = (e.target.value || null) as any;
        const prev = photo.photo_view ?? null;
        try {
          // optimistic update
          setPhotos((arr) => arr.map(x => x.pk_photo_id === photo.pk_photo_id ? { ...x, photo_view: newVal } : x));
          const { error } = await supabase
            .from('photos')
            .update({ photo_view: newVal })
            .eq('pk_photo_id', photo.pk_photo_id);
          if (error) {
            // rollback on error
            setPhotos((arr) => arr.map(x => x.pk_photo_id === photo.pk_photo_id ? { ...x, photo_view: prev as any } : x));
            console.error('[photos] update photo_view failed', error);
            alert('Failed to update view.');
          }
        } catch (err) {
          setPhotos((arr) => arr.map(x => x.pk_photo_id === photo.pk_photo_id ? { ...x, photo_view: prev as any } : x));
          console.error('[photos] update photo_view threw', err);
          alert('Failed to update view.');
        }
      }}
    >
      <option value="">—</option>
      <option value="ventral">ventral</option>
      <option value="dorsal">dorsal</option>
      <option value="other">other</option>
    </select>
  </div>
) : (
  <p><strong>View:</strong> {photo.photo_view ?? '—'}</p>
)}
          {isAdmin && (
            <div className="mt-1">
              <button
                className="text-red-600 text-xs flex items-center gap-1"
                onClick={async () => {
                  if (!confirm("Are you sure you want to delete this photo?")) return;
                  try { await deletePhoto(photo.pk_photo_id); window.location.reload(); }
                  catch (e) { alert('Delete failed: ' + (e?.message || e)); }
                }}
                title="Delete photo"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}

                  {/* Show badge + update button ONLY for the current BEST MANTA VENTRAL */}
                  {photo.photo_view === "ventral" && photo.is_best_manta_ventral_photo ? (
                    <div className="mt-1">
                      <span className="inline-flex items-center rounded bg-blue-100 text-blue-800 text-[11px] px-2 py-0.5">
                        Best Manta Ventral
                      </span>
                      {isAdmin && photo.fk_manta_id ? (
                        <button
                          onClick={() => openBestPicker(photo.fk_manta_id!)}
                          className="ml-2 text-[11px] underline text-blue-700"
                          title="Update best manta ventral photo"
                        >
                          update
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {loadingMore && (
          <div className="flex justify-center py-6">
            <div className="h-7 w-7 rounded-full border-4 border-gray-300 border-t-blue-600 animate-spin" aria-label="Loading more" />
          </div>
        )}

        <div ref={loadingRef} className="h-12" />

        <BackToTopButton />
      </div>

      {/* Best-manta selector modal */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Select best manta ventral photo</DialogTitle>
          </DialogHeader>

          {pickerError ? (
            <div className="text-red-600 text-sm">{pickerError}</div>
          ) : pickerItems.length === 0 ? (
            <div className="text-sm text-muted-foreground">No ventral photos found for this manta.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {pickerItems.map((p) => {
                const selected = p.pk_photo_id === pickerSelectedId;
                return (
                  <button
                    key={p.pk_photo_id}
                    className={`rounded border p-1 text-left ${selected ? "ring-2 ring-blue-600" : ""}`}
                    onClick={() => setPickerSelectedId(p.pk_photo_id)}
                  >
                    <img
                      src={p.thumbnail_url || "/manta-logo.svg"}
                      alt={`Photo ${p.pk_photo_id}`}
                      className="w-full h-[140px] object-cover rounded"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => ((e.target as HTMLImageElement).src = "/manta-logo.svg")}
                    />
                    <div className="mt-1 text-[11px]">ID: {p.pk_photo_id}</div>
                  </button>
                );
              })}
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="secondary" onClick={() => setPickerOpen(false)} disabled={pickerSaving}>
              Cancel
            </Button>
            <Button onClick={saveNewBest} disabled={!pickerSelectedId || pickerSaving}>
              {pickerSaving ? "Saving…" : "Save as Best"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
