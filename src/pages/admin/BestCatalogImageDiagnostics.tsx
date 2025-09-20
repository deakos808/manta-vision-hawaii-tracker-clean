// File: src/pages/admin/BestCatalogImageDiagnostics.tsx
import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

type ViewFilter = "ventral" | "dorsal";

interface Photo {
  pk_photo_id: number;
  fk_catalog_id: number | null;
  fk_manta_id: number | null;
  thumbnail_url: string | null;
  storage_path: string | null;
  photo_view: string | null;
  uploaded_at?: string | null;
  view_label?: string | null;

  // catalog-level flags
  is_best_catalog_ventral_photo: boolean | null;
  is_best_catalog_dorsal_photo: boolean | null;

  // manta-level flags (for chooser candidates)
  is_best_manta_ventral_photo: boolean | null;
  is_best_manta_dorsal_photo: boolean | null;
}

const IMAGE_BUCKET = "manta-images";
const PAGE_SIZE = 1000;
const fmt = (n: number) => n.toLocaleString();

function resolveImageUrl(p: Pick<Photo, "thumbnail_url" | "storage_path">): string {
  if (p.thumbnail_url && /^https?:\/\//i.test(p.thumbnail_url)) return p.thumbnail_url;
  if (p.thumbnail_url && p.thumbnail_url.length > 0) {
    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(p.thumbnail_url);
    if (data?.publicUrl) return data.publicUrl;
  }
  if (p.storage_path && p.storage_path.length > 0) {
    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(p.storage_path);
    if (data?.publicUrl) return data.publicUrl;
  }
  return "/manta-logo.svg";
}

/** Fetch ALL photos for one view (for grid + grouping). */
async function fetchAllPhotos(view: ViewFilter): Promise<Photo[]> {
  let from = 0;
  const out: Photo[] = [];
  while (true) {
    const { data, error } = await supabase
      .from("photos")
      .select(
        "pk_photo_id,fk_catalog_id,fk_manta_id,thumbnail_url,storage_path,photo_view,uploaded_at,view_label,is_best_catalog_ventral_photo,is_best_catalog_dorsal_photo,is_best_manta_ventral_photo,is_best_manta_dorsal_photo"
      )
      .eq("photo_view", view)
      .not("fk_catalog_id", "is", null)
      .order("pk_photo_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const batch = (data as Photo[]) ?? [];
    out.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

/** Get the current catalog-level best photo pk for a catalog+view. */
async function fetchCurrentBestPk(catalogId: number, view: ViewFilter): Promise<number | null> {
  if (view === "ventral") {
    // Prefer the catalog pointer; fall back to the photo flag.
    const { data: catRows, error: catErr } = await supabase
      .from("catalog")
      .select("best_cat_mask_ventral_id_int")
      .eq("pk_catalog_id", catalogId)
      .limit(1);
    if (!catErr && catRows && catRows.length && catRows[0].best_cat_mask_ventral_id_int != null) {
      return Number(catRows[0].best_cat_mask_ventral_id_int);
    }
    const { data: photRows } = await supabase
      .from("photos")
      .select("pk_photo_id")
      .eq("fk_catalog_id", catalogId)
      .eq("photo_view", "ventral")
      .eq("is_best_catalog_ventral_photo", true)
      .limit(1);
    return photRows?.[0]?.pk_photo_id ?? null;
  } else {
    // Dorsal path: only uses the photo flag.
    const { data: photRows } = await supabase
      .from("photos")
      .select("pk_photo_id")
      .eq("fk_catalog_id", catalogId)
      .eq("photo_view", "dorsal")
      .eq("is_best_catalog_dorsal_photo", true)
      .limit(1);
    return photRows?.[0]?.pk_photo_id ?? null;
  }
}

/** Fetch one photo by pk (minimal columns used by the chooser grid). */
async function fetchPhotoByPk(pk: number): Promise<Photo | null> {
  const { data, error } = await supabase
    .from("photos")
    .select(
      "pk_photo_id,fk_catalog_id,fk_manta_id,thumbnail_url,storage_path,photo_view,uploaded_at,view_label,is_best_manta_ventral_photo,is_best_manta_dorsal_photo,is_best_catalog_ventral_photo,is_best_catalog_dorsal_photo"
    )
    .eq("pk_photo_id", pk)
    .limit(1);
  if (error || !data || !data.length) return null;
  return data[0] as Photo;
}


/** Fetch minimal rows for BOTH views to compute counts next to each filter option. */
async function fetchCountsForBothViews(): Promise<{
  ventral: { any: number; best: number; missing: number };
  dorsal: { any: number; best: number; missing: number };
}> {
  let from = 0;
  type Mini = Pick<
    Photo,
    "fk_catalog_id" | "photo_view" | "is_best_catalog_ventral_photo" | "is_best_catalog_dorsal_photo"
  >;
  const minis: Mini[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("photos")
      .select("fk_catalog_id,photo_view,is_best_catalog_ventral_photo,is_best_catalog_dorsal_photo")
      .in("photo_view", ["ventral", "dorsal"])
      .not("fk_catalog_id", "is", null)
      .order("fk_catalog_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data as Mini[]) ?? [];
    minis.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const group = (view: ViewFilter) => {
    const byCatalog = new Map<number, Mini[]>();
    minis.forEach((m) => {
      if (m.photo_view !== view || m.fk_catalog_id == null) return;
      const id = Number(m.fk_catalog_id);
      if (!byCatalog.has(id)) byCatalog.set(id, []);
      byCatalog.get(id)!.push(m);
    });
    const any = byCatalog.size;
    let best = 0;
    for (const [, arr] of byCatalog) {
      if (
        view === "ventral"
          ? arr.some((p) => !!p.is_best_catalog_ventral_photo)
          : arr.some((p) => !!p.is_best_catalog_dorsal_photo)
      ) {
        best++;
      }
    }
    return { any, best, missing: Math.max(0, any - best) };
  };

  return { ventral: group("ventral"), dorsal: group("dorsal") };
}

export default function BestCatalogImageDiagnostics() {
  const [viewFilter, setViewFilter] = useState<ViewFilter>("ventral");
  const [showOnlyMissing, setShowOnlyMissing] = useState<boolean>(true);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [catalogNames, setCatalogNames] = useState<Map<number, string>>(new Map());


  // Counts for both views
  const [counts, setCounts] = useState<{
    ventral: { any: number; best: number; missing: number };
    dorsal: { any: number; best: number; missing: number };
  }>({ ventral: { any: 0, best: 0, missing: 0 }, dorsal: { any: 0, best: 0, missing: 0 } });
  const [countsLoading, setCountsLoading] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [activeCatalogId, setActiveCatalogId] = useState<number | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idStr = params.get("catalogId") || params.get("catalogid") || params.get("catalog_id");
    const open = params.get("open");
    if (idStr) {
      const idNum = Number(idStr);
      if (!Number.isNaN(idNum)) {
        setActiveCatalogId(idNum);
      }
    }
    if ((open === "1" || open === "true") && idStr) {
      setModalOpen(true);
    }
  }, []);

  const [candidatePhotos, setCandidatePhotos] = useState<Photo[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<number | null>(null);

  // Initial: load counts + current view data
  useEffect(() => {
    void Promise.all([loadCounts(), loadPhotos()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When view changes: reload grid
  useEffect(() => {
    void loadPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewFilter]);

  const loadCounts = async () => {
    setCountsLoading(true);
    try {
      const c = await fetchCountsForBothViews();
      setCounts(c);
    } catch (e: any) {
      console.error("[BestCatalog] count error:", e?.message || e);
    } finally {
      setCountsLoading(false);
    }
  };

  const loadPhotos = async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchAllPhotos(viewFilter);
      setPhotos(data);
    } catch (e: any) {
      console.error("[BestCatalog] load error:", e?.message || e);
      setErr(e?.message || "Failed to load photos");
    } finally {
      setLoading(false);
    }
  };

  // Group by catalog for the current view
  const byCatalog = useMemo(() => {
    const map = new Map<number, Photo[]>();
    photos.forEach((p) => {
      if (p.fk_catalog_id == null) return;
      const cid = Number(p.fk_catalog_id);
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid)!.push(p);
    });
    for (const [, arr] of map) {
      arr.sort((a, b) => {
        const au = a.uploaded_at ? Date.parse(a.uploaded_at) : 0;
        const bu = b.uploaded_at ? Date.parse(b.uploaded_at) : 0;
        if (bu !== au) return bu - au;
        return (b.pk_photo_id || 0) - (a.pk_photo_id || 0);
      });
    }
    return map;
  }, [photos]);

  useEffect(() => {
    const ids = Array.from(byCatalog.keys());
    if (ids.length === 0) { setCatalogNames(new Map()); return; }
    const run = async () => {
      const CHUNK = 500;
      const map = new Map<number, string>();
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("catalog")
          .select("pk_catalog_id, name")
          .in("pk_catalog_id", chunk);
        if (!error && data) {
          for (const r of data as any[]) {
            map.set(Number(r.pk_catalog_id), r.name ?? "");
          }
        }
      }
      setCatalogNames(map);
    };
    run();
  }, [byCatalog]);


  const rows = useMemo(() => {
    const flagKey =
      viewFilter === "ventral" ? "is_best_catalog_ventral_photo" : "is_best_catalog_dorsal_photo";
    const out = Array.from(byCatalog.entries()).map(([catalogId, group]) => {
      const best = group.find((p) => !!(p as any)[flagKey]);
      const preview = best ?? group[0];
      const missing = !best;
      return { catalogId, best, preview, count: group.length, missing };
    });
    return out
      .filter((r) => (showOnlyMissing ? r.missing : true))
      .sort((a, b) => {
        if (a.missing !== b.missing) return a.missing ? -1 : 1;
        return a.catalogId - b.catalogId;
      });
  }, [byCatalog, showOnlyMissing, viewFilter]);

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return rows;
    const isNum = /^\d+$/.test(q);
    if (isNum) {
      return rows.filter((r) => String(r.catalogId).includes(q));
    }
    return rows.filter((r) => (catalogNames.get(r.catalogId) ?? "").toLowerCase().includes(q));
  }, [rows, searchText, catalogNames]);


  // Summary for current view
  const catalogsWithAny = useMemo(
    () => (viewFilter === "ventral" ? counts.ventral.any : counts.dorsal.any),
    [counts, viewFilter]
  );
  const catalogsWithBest = useMemo(
    () => (viewFilter === "ventral" ? counts.ventral.best : counts.dorsal.best),
    [counts, viewFilter]
  );
  const missingCount = Math.max(0, catalogsWithAny - catalogsWithBest);
  const missingLabel =
    viewFilter === "ventral" ? "Missing Best Ventral" : "Missing Best Dorsal";

  const openChooser = async (catalogId: number) => {
  setActiveCatalogId(catalogId);
  setModalOpen(true);
  setCandidateLoading(true);
  setSelectedPhotoId(null);

  try {
    // 1) Pull "best manta" candidates for this catalog & view
    const flagCol =
      viewFilter === "ventral" ? "is_best_manta_ventral_photo" : "is_best_manta_dorsal_photo";

    const { data, error } = await supabase
      .from("photos")
      .select(
        "pk_photo_id,fk_catalog_id,fk_manta_id,thumbnail_url,storage_path,photo_view,uploaded_at,view_label,is_best_manta_ventral_photo,is_best_manta_dorsal_photo,is_best_catalog_ventral_photo,is_best_catalog_dorsal_photo"
      )
      .eq("fk_catalog_id", catalogId)
      .eq("photo_view", viewFilter)
      .eq(flagCol, true)
      .order("uploaded_at", { ascending: false })
      .order("pk_photo_id", { ascending: false });

    if (error) throw error;
    const candidates = (data as Photo[]) || [];

    // 2) Find current catalog-level best pk for this view
    const currentBestPk = await fetchCurrentBestPk(catalogId, viewFilter);

    // 3) Ensure the current best is included even if it isn't a "best manta" candidate
    let merged = [...candidates];
    if (
      currentBestPk != null &&
      !merged.some((p) => p.pk_photo_id === currentBestPk)
    ) {
      const currentBestRow = await fetchPhotoByPk(currentBestPk);
      if (currentBestRow && currentBestRow.photo_view === viewFilter) {
        merged = [currentBestRow, ...merged];
      }
    }

    setCandidatePhotos(merged);

    // 4) Preselect strictly: prefer the catalog-level best if present; else none
    let preId: number | null = null;
    if (currentBestPk != null && merged.some((p) => p.pk_photo_id === currentBestPk)) {
      preId = currentBestPk;
    } else {
      const catBest =
        viewFilter === "ventral"
          ? merged.find((p) => !!p.is_best_catalog_ventral_photo)
          : merged.find((p) => !!p.is_best_catalog_dorsal_photo);
      preId = catBest?.pk_photo_id ?? null;
    }
    setSelectedPhotoId(preId);
  } catch (e: any) {
    console.error("[BestCatalog] candidate load error:", e?.message || e);
    toast({
      title: "No candidate photos",
      description:
        "No best manta photos found for this catalog in this view. Set manta best photos first.",
    });
    setCandidatePhotos([]);
  } finally {
    setCandidateLoading(false);
  }
};
const redirectBack = (id?: number | null) => {
  const params = new URLSearchParams(window.location.search);
  const rt = params.get("returnTo");
  const target = rt || `/browse/catalog?focus=${id ?? activeCatalogId ?? ""}`;
  window.location.assign(target);
};

  const setBestForActive = async () => {
    if (!activeCatalogId || !selectedPhotoId) return;
    const flagKey =
      viewFilter === "ventral"
        ? "is_best_catalog_ventral_photo"
        : "is_best_catalog_dorsal_photo";

    try {
      setCandidateLoading(true);

      // 1) Clear any previous best for this catalog + view (set to NULL per your schema)
      const { error: clearErr } = await supabase
        .from("photos")
        .update({ [flagKey]: null } as any)
        .eq("fk_catalog_id", activeCatalogId)
        .eq("photo_view", viewFilter);
      if (clearErr) {
        console.error("[BestCatalog] clear old best error:", clearErr);
        toast({
          variant: "destructive",
          title: "Failed to clear previous best",
          description: String(clearErr.message || clearErr),
        });
        return;
      }

      // 2) Set the selected photo as best
      const { error: setErr } = await supabase
        .from("photos")
        .update({ [flagKey]: true } as any)
        .eq("pk_photo_id", selectedPhotoId);
      if (setErr) {
        console.error("[BestCatalog] set new best error:", setErr);
        toast({
          variant: "destructive",
          title: "Failed to set new best",
          description: String(setErr.message || setErr),
        });
        return;
      }

      // 3) Keep catalog pointer consistent for ventral (drives URL triggers)
      if (viewFilter === "ventral") {
        const { error: catErr } = await supabase
          .from("catalog")
          .update({ best_cat_mask_ventral_id_int: selectedPhotoId })
          .eq("pk_catalog_id", activeCatalogId);
        if (catErr) {
          console.error("[BestCatalog] update catalog pointer error:", catErr);
        }
      }

      // 4) Update local UI (modal + grid) without reload
      setCandidatePhotos(prev =>
        prev.map(p => ({ ...(p as any), [flagKey]: p.pk_photo_id === selectedPhotoId }))
      );
      setPhotos(prev =>
        prev.map(p =>
          p.fk_catalog_id === activeCatalogId && p.photo_view === viewFilter
            ? ({ ...(p as any), [flagKey]: p.pk_photo_id === selectedPhotoId })
            : p
        )
      );

      toast({
        title: "Best photo updated",
        description: `Catalog ${activeCatalogId} · Photo ${selectedPhotoId}`,
      });
    } finally {
      setCandidateLoading(false);
    }
  };
  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="text-sm text-muted-foreground pb-2">
          <Link to="/admin" className="underline hover:text-primary">
            ← Back to Admin Dashboard
          </Link>
        </div>

        {/* Hero */}
        <div className="bg-blue-600 text-white py-6 px-4 sm:px-8 lg:px-16 rounded-md shadow">
          <h1 className="text-3xl font-bold">Best Catalog Photo Check</h1>
          <p className="mt-1 text-white/90 text-sm">
            Choose a single <span className="font-semibold">{viewFilter}</span> “best” photo per catalog.
          </p>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3">
          <div className="w-full max-w-sm">
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search by Catalog ID or Name"
            />
          </div>
          {searchText ? (
            <Button variant="outline" size="sm" onClick={() => setSearchText("")}>Clear</Button>
          ) : null}
        </div>

        {/* Filter box with counts */}
        <div className="bg-blue-50 border rounded-xl p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-800 mb-2">
            Filter
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* View stack */}
            <div>
              <div className="text-sm font-medium mb-1">View</div>
              <ToggleGroup
                type="single"
                value={viewFilter}
                onValueChange={(v) => v && setViewFilter(v as ViewFilter)}
                className="flex flex-col items-start gap-2"
              >
                <ToggleGroupItem className="w-full justify-between" value="ventral">
                  <span>Ventral</span>
                  <span className="text-xs text-muted-foreground">({fmt(counts.ventral.any)})</span>
                </ToggleGroupItem>
                <ToggleGroupItem className="w-full justify-between" value="dorsal">
                  <span>Dorsal</span>
                  <span className="text-xs text-muted-foreground">({fmt(counts.dorsal.any)})</span>
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* Records stack */}
            <div>
              <div className="text-sm font-medium mb-1">Records</div>
              <ToggleGroup
                type="single"
                value={showOnlyMissing ? "missing" : "all"}
                onValueChange={(v) => setShowOnlyMissing(v === "missing")}
                className="flex flex-col items-start gap-2"
              >
                <ToggleGroupItem className="w-full justify-between" value="missing">
                  <span>{missingLabel}</span>
                  <span className="text-xs text-muted-foreground">
                    ({fmt(viewFilter === "ventral" ? counts.ventral.missing : counts.dorsal.missing)})
                  </span>
                </ToggleGroupItem>
                <ToggleGroupItem className="w-full justify-between" value="all">
                  <span>Show All</span>
                  <span className="text-xs text-muted-foreground">
                    ({fmt(viewFilter === "ventral" ? counts.ventral.any : counts.dorsal.any)})
                  </span>
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </div>

        {/* Status line */}
        <div className="text-sm text-blue-800">
          {fmt(filteredRows.length)} records showing of {fmt(catalogsWithAny)} total records (
          filtered by: View={viewFilter}, Records={showOnlyMissing ? missingLabel : "All"})
          {countsLoading ? <span className="ml-2 text-xs text-muted-foreground">updating counts…</span> : null}
        </div>

        {err && <p className="text-red-600 text-sm">⚠️ {err}</p>}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading photos…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No catalog records match the current filter.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredRows.map(({ catalogId, preview, best, count }) => (
              <Card key={catalogId}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">Catalog ID: {catalogId}</div>
                    <Badge variant={best ? "default" : "secondary"}>
                      {best ? "Has Best" : "Missing Best"}
                    </Badge>
                  </div>

                  <div>
                    <img
                      src={preview ? resolveImageUrl(preview) : "/manta-logo.svg"}
                      alt={`Catalog ${catalogId}`}
                      className="w-full h-40 object-cover rounded border"
                      onError={(e) => ((e.currentTarget as HTMLImageElement).src = "/manta-logo.svg")}
                    />
                    <div className="mt-1 text-xs text-muted-foreground">
                      {best ? (
                        <>
                          Best {viewFilter} Photo ID: <strong>{best.pk_photo_id}</strong>
                        </>
                      ) : (
                        <>No best selected.</>
                      )}{" "}
                      <span className="ml-2 capitalize">{viewFilter} photos: {fmt(count)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant={best ? "outline" : "default"}
                      size="sm"
                      onClick={() => openChooser(catalogId)}
                    >
                      {best ? "Change" : "Choose"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Modal chooser: shows *best manta* photos only */}
        <Dialog open={modalOpen} onOpenChange={(open) => { setModalOpen(open); if (!open) redirectBack(activeCatalogId); }}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                Select Best {viewFilter.charAt(0).toUpperCase() + viewFilter.slice(1)} Photo
                {activeCatalogId ? ` · Catalog ${activeCatalogId}` : ""}
              </DialogTitle>
            </DialogHeader>

            {candidateLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading photos…
              </div>
            ) : candidatePhotos.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No best manta {viewFilter} photos found for this catalog. Set manta best photos first.
              </div>
            ) : (
              <RadioGroup
                value={selectedPhotoId?.toString() ?? ""}
                onValueChange={(val) => setSelectedPhotoId(Number(val))}
                className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-2"
              >
                {candidatePhotos.map((p) => {
                  const isCatalogBest =
                    viewFilter === "ventral" ? !!p.is_best_catalog_ventral_photo : !!p.is_best_catalog_dorsal_photo;
                  return (
                    <label key={p.pk_photo_id} className="block cursor-pointer">
                      <img
                        src={resolveImageUrl(p)}
                        alt={`Photo ${p.pk_photo_id}`}
                        className="w-full h-32 object-cover rounded border"
                        onError={(e) => ((e.currentTarget as HTMLImageElement).src = "/manta-logo.svg")}
                      />
                      <div className="mt-2 flex items-center gap-2 text-sm">
                        <RadioGroupItem value={String(p.pk_photo_id)} id={`ph-${p.pk_photo_id}`} />
                        <Label htmlFor={`ph-${p.pk_photo_id}`}>ID {p.pk_photo_id}</Label>
                        {isCatalogBest && <Badge className="ml-auto">Current Best</Badge>}
                      </div>
                    </label>
                  );
                })}
              </RadioGroup>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={async () => { await setBestForActive(); setModalOpen(false); }} disabled={!activeCatalogId || !selectedPhotoId || candidateLoading}>
                {candidateLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Set Best
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
