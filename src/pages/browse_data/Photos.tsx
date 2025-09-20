import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import Layout from "@/components/layout/Layout";
import { ChevronUp } from "lucide-react";
import PhotoFilterBox from "@/components/photos/PhotoFilterBox";
import { Button } from "@/components/ui/button";
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
}

const PAGE_SIZE = 80;

type PillOption = { value: string; count: number };

export default function PhotosPage() {
  const [searchParams] = useSearchParams();
  const mantaIdParam = searchParams.get("mantaId");
  const catalogIdParam = searchParams.get("catalogId");
  const sightingIdParam = searchParams.get("sightingId");

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const [filters, setFilters] = useState<FiltersState>({
    population: [],
    island: [],
    location: [],
    view: [],
    flag: [],
  });

  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [totalCount, setTotalCount] = useState<number>(0);

  const [populationCounts, setPopulationCounts] = useState<PillOption[]>([]);
  const [islandCounts, setIslandCounts] = useState<PillOption[]>([]);
  const [locationCounts, setLocationCounts] = useState<PillOption[]>([]);
  const [viewCounts, setViewCounts] = useState<PillOption[]>([]);

  const loadingRef = useRef<HTMLDivElement>(null);
  const [lastQuery, setLastQuery] = useState<string>("");

  // Modal state for choosing a new best manta ventral
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMantaId, setPickerMantaId] = useState<number | null>(null);
  const [pickerItems, setPickerItems] = useState<Photo[]>([]);
  const [pickerSelectedId, setPickerSelectedId] = useState<number | null>(null);
  const [pickerSaving, setPickerSaving] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  // ---- Pill counts (computed once) -----------------------------------------
  useEffect(() => {
    async function fetchPillCounts() {
      const { data, error } = await supabase
        .from("photos_with_photo_view")
        .select("population, island, location, photo_view");
      if (error) {
        console.error("Pill fetch error:", error);
        return;
      }
      function tally(field: string, allowed?: string[]): PillOption[] {
        const map: Record<string, number> = {};
        (data ?? []).forEach((row) => {
          const val = (row[field] ?? "Unknown") as string;
          if (allowed && !allowed.includes(val)) return;
          map[val] = (map[val] || 0) + 1;
        });
        let arr = Object.entries(map).map(([value, count]) => ({ value, count }));
        if (allowed) {
          arr = allowed.map((value) => ({ value, count: map[value] || 0 }));
        } else {
          arr.sort((a, b) => a.value.localeCompare(b.value));
        }
        return arr;
      }
      setPopulationCounts(tally("population", POPULATIONS));
      setIslandCounts(tally("island"));
      setLocationCounts(tally("location"));
      setViewCounts(tally("photo_view", VIEWS));
    }
    fetchPillCounts();
  }, []);

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

    if (filters.view.length > 0) query = query.in("photo_view", filters.view);
    if (filters.flag.includes("best_catalog"))
      query = query.eq("is_best_catalog_ventral_photo", true);
    // NOTE: we won't rely on best_manta flag here because the view might not expose it.
    if (filters.population.length > 0) query = query.in("population", filters.population);
    if (filters.island.length > 0) query = query.in("island", filters.island);
    if (filters.location.length > 0) query = query.in("location", filters.location);
    return query;
  }

  const fetchPhotos = useCallback(
    async (reset: boolean = false) => {
      let query = supabase
        .from("photos_with_photo_view")
        .select("*", { count: "exact" });

      query = applySupabaseFilters(query);
      query = query.order("pk_photo_id", { ascending: sortAsc });

      const from = reset ? 0 : page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) {
        console.error("Photo fetch error:", error);
        return;
      }

      const incoming = (data ?? []) as Photo[];

      // HYDRATE: get is_best_manta_ventral_photo from the base table.
      const ids = incoming.map((p) => p.pk_photo_id);
      if (ids.length) {
        const { data: flags, error: flagErr } = await supabase
          .from("photos")
          .select("pk_photo_id,is_best_manta_ventral_photo")
          .in("pk_photo_id", ids);
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

      setPhotos((prev) => {
        const seen = new Set<number>(prev.map((p) => p.pk_photo_id));
        const merged = reset ? [] : [...prev];
        for (const row of incoming) {
          if (!seen.has(row.pk_photo_id)) {
            seen.add(row.pk_photo_id);
            merged.push(row);
          } else {
            // if we already had this photo, update its flag (in case it changed)
            const idx = merged.findIndex((x) => x.pk_photo_id === row.pk_photo_id);
            if (idx >= 0) merged[idx] = { ...merged[idx], ...row };
          }
        }
        return merged;
      });

      if (reset) {
        setPage(1);
        setHasMore((incoming.length ?? 0) >= PAGE_SIZE);
        setTotalCount(count ?? 0);
      } else {
        setPage((prev) => prev + 1);
        setHasMore((incoming.length ?? 0) >= PAGE_SIZE);
        setTotalCount(count ?? photos.length + (data?.length ?? 0));
      }
    },
    [
      search,
      filters,
      sortAsc,
      page,
      mantaIdParam,
      catalogIdParam,
      sightingIdParam,
      photos.length,
    ]
  );

  // Reset paging when inputs change
  useEffect(() => {
    const queryKey = JSON.stringify({
      search,
      filters,
      sortAsc,
      mantaIdParam,
      catalogIdParam,
      sightingIdParam,
    });
    if (queryKey !== lastQuery) {
      setLastQuery(queryKey);
      setPhotos([]);
      setPage(0);
      setHasMore(true);
      fetchPhotos(true);
    }
    // eslint-disable-next-line
  }, [search, filters, sortAsc, mantaIdParam, catalogIdParam, sightingIdParam]);

  // Infinite scroll
  useEffect(() => {
    if (!hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) fetchPhotos(false);
      },
      { threshold: 1 }
    );
    if (loadingRef.current) obs.observe(loadingRef.current);
    return () => obs.disconnect();
  }, [hasMore, fetchPhotos]);

  const onClearFilters = () => {
    setSearch("");
    setFilters({
      population: [],
      island: [],
      location: [],
      view: [],
      flag: [],
    });
  };

  function filterSummary() {
    const f: string[] = [];
    if (mantaIdParam || catalogIdParam || sightingIdParam) f.push("Scoped");
    if (search) f.push("Search");
    if (filters.view.length) f.push("View");
    if (filters.flag.length) f.push("Flags");
    if (filters.population.length) f.push("Population");
    if (filters.island.length) f.push("Island");
    if (filters.location.length) f.push("Location");
    return f.length ? ` (filtered by ${f.join(", ")})` : "";
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

  return (
    <Layout title="Photos">
      <div className="p-4">
        <div className="text-center mb-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-md py-6">
            Photos
          </h1>
        </div>

        <div className="mb-4 text-sm text-blue-600 text-left space-y-1">
          <div>
            <Link to="/browse/data" className="underline">← Return to Browse Data</Link>
          </div>
          <div>
            <Link to={backToMantasHref} className="underline">
              {mantaIdParam ? `← Return to Manta ${mantaIdParam}` : "← Return to Mantas"}
            </Link>
          </div>
        </div>

        <PhotoFilterBox
          rows={photoRows}
          filters={filters}
          setFilters={setFilters}
          sortAsc={setSortAsc as any}
          setSortAsc={setSortAsc}
          onClearAll={onClearFilters}
          search={search}
          setSearch={setSearch}
          populationCounts={populationCounts}
          islandCounts={islandCounts}
          locationCounts={locationCounts}
          viewCounts={viewCounts}
        />

        <p className="mb-4 text-sm text-muted-foreground">
          Showing {photoRows.length} of {totalCount} photos{filterSummary()}
        </p>

        {photoRows.length === 0 ? (
          <p className="text-center text-gray-500">No results found.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
            {photoRows.map((photo) => (
              <div key={photo.pk_photo_id} className="border rounded p-2">
                <img
                  src={photo.thumbnail_url || "/manta-logo.svg"}
                  alt="manta thumbnail"
                  className="w-full h-[140px] object-cover rounded"
                  onError={(e) => ((e.target as HTMLImageElement).src = "/manta-logo.svg")}
                />
                <div className="mt-2 text-xs leading-5">
                  <p><strong>Catalog:</strong> {photo.fk_catalog_id ?? "n/a"}</p>
                  <p><strong>Name:</strong> {photo.catalog_name ?? "—"}</p>
                  <p><strong>Sighting:</strong> {photo.fk_sighting_id ?? "n/a"}</p>
                  <p><strong>Manta:</strong> {photo.fk_manta_id ?? "n/a"}</p>
                  <p><strong>Photo:</strong> {photo.pk_photo_id}</p>
                  <p><strong>Photographer:</strong> {photo.photographer ?? "n/a"}</p>
                  <p><strong>View:</strong> {photo.photo_view}</p>

                  {/* Show badge + update button ONLY for the current BEST MANTA VENTRAL */}
                  {photo.photo_view === "ventral" && photo.is_best_manta_ventral_photo ? (
                    <div className="mt-1">
                      <span className="inline-flex items-center rounded bg-blue-100 text-blue-800 text-[11px] px-2 py-0.5">
                        Best Manta Ventral
                      </span>
                      {photo.fk_manta_id ? (
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

        <div ref={loadingRef} className="h-12" />

        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-4 right-4 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full shadow-lg"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
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
