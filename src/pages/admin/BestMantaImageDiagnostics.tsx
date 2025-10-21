import ReviewSubmissionsCard from "@/components/admin/ReviewSubmissionsCard";
// File: src/pages/admin/BestMantaImageDiagnostics.tsx
import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  fk_manta_id: number | null;
  fk_catalog_id: number | null;
  thumbnail_url: string | null;
  storage_path: string | null;
  photo_view: string | null;
  is_best_manta_ventral_photo: boolean | null;
  is_best_manta_dorsal_photo: boolean | null;
  uploaded_at?: string | null;
  view_label?: string | null;
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

/** Fetch ALL photos for a single view (paged) so grid & counts reflect the entire table (within RLS). */
async function fetchAllPhotos(view: ViewFilter): Promise<Photo[]> {
  let from = 0;
  const out: Photo[] = [];
  while (true) {
    const { data, error } = await supabase
      .from("photos")
      .select(
        "pk_photo_id,fk_manta_id,fk_catalog_id,thumbnail_url,storage_path,photo_view,is_best_manta_ventral_photo,is_best_manta_dorsal_photo,uploaded_at,view_label"
      )
      .eq("photo_view", view)
      .not("fk_manta_id", "is", null)
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

/** Fetch minimal rows for BOTH views to compute counts shown next to each filter option. */
async function fetchCountsForBothViews(): Promise<{
  ventral: { any: number; best: number; missing: number };
  dorsal: { any: number; best: number; missing: number };
}> {
  let from = 0;
  type Mini = Pick<
    Photo,
    "fk_manta_id" | "photo_view" | "is_best_manta_ventral_photo" | "is_best_manta_dorsal_photo"
  >;
  const minis: Mini[] = [];
  while (true) {
    const { data, error } = await supabase
      .from("photos")
      .select("fk_manta_id,photo_view,is_best_manta_ventral_photo,is_best_manta_dorsal_photo")
      .in("photo_view", ["ventral", "dorsal"])
      .not("fk_manta_id", "is", null)
      .order("fk_manta_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data as Mini[]) ?? [];
    minis.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const group = (view: ViewFilter) => {
    const byManta = new Map<number, Mini[]>();
    minis.forEach((m) => {
      if (m.photo_view !== view || m.fk_manta_id == null) return;
      const id = Number(m.fk_manta_id);
      if (!byManta.has(id)) byManta.set(id, []);
      byManta.get(id)!.push(m);
    });
    const any = byManta.size;
    let best = 0;
    for (const [, arr] of byManta) {
      if (
        view === "ventral"
          ? arr.some((p) => !!p.is_best_manta_ventral_photo)
          : arr.some((p) => !!p.is_best_manta_dorsal_photo)
      ) {
        best++;
      }
    }
    return { any, best, missing: Math.max(0, any - best) };
  };

  return { ventral: group("ventral"), dorsal: group("dorsal") };
}

export default function BestMantaImageDiagnostics() {
  const [viewFilter, setViewFilter] = useState<ViewFilter>("ventral");
  const [showOnlyMissing, setShowOnlyMissing] = useState<boolean>(true);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Counts for both views (for labels in filter)
  const [counts, setCounts] = useState<{
    ventral: { any: number; best: number; missing: number };
    dorsal: { any: number; best: number; missing: number };
  }>({ ventral: { any: 0, best: 0, missing: 0 }, dorsal: { any: 0, best: 0, missing: 0 } });
  const [countsLoading, setCountsLoading] = useState(false);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [activeMantaId, setActiveMantaId] = useState<number | null>(null);
  const [candidatePhotos, setCandidatePhotos] = useState<Photo[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<number | null>(null);

  // Initial loads
  useEffect(() => {
    void Promise.all([loadPhotos(), loadCounts()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload grid when view changes
  useEffect(() => {
    void loadPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewFilter]);

  const loadPhotos = async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchAllPhotos(viewFilter);
      setPhotos(data);
    } catch (e: any) {
      console.error("[BestMantaImageDiagnostics] load error:", e?.message || e);
      setErr(e?.message || "Failed to load photos");
    } finally {
      setLoading(false);
    }
  };

  const loadCounts = async () => {
    setCountsLoading(true);
    try {
      const c = await fetchCountsForBothViews();
      setCounts(c);
    } catch (e: any) {
      console.error("[BestMantaImageDiagnostics] count error:", e?.message || e);
    } finally {
      setCountsLoading(false);
    }
  };

  // Group by manta for the current view
  const byManta = useMemo(() => {
    const map = new Map<number, Photo[]>();
    photos.forEach((p) => {
      if (p.fk_manta_id == null) return;
      const mid = Number(p.fk_manta_id);
      if (!map.has(mid)) map.set(mid, []);
      map.get(mid)!.push(p);
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

  // Rows for grid
  const rows = useMemo(() => {
    const flagKey =
      viewFilter === "ventral" ? "is_best_manta_ventral_photo" : "is_best_manta_dorsal_photo";
    const out = Array.from(byManta.entries()).map(([mantaId, group]) => {
      const best = group.find((p) => !!(p as any)[flagKey]);
      const preview = best ?? group[0];
      const missing = !best;
      return { mantaId, best, preview, count: group.length, missing };
    });
    return out
      .filter((r) => (showOnlyMissing ? r.missing : true))
      .sort((a, b) => {
        if (a.missing !== b.missing) return a.missing ? -1 : 1;
        return a.mantaId - b.mantaId;
      });
  }, [byManta, showOnlyMissing, viewFilter]);

  // Summary numbers for *current* view
  const mantasWithAnyView = useMemo(
    () => (viewFilter === "ventral" ? counts.ventral.any : counts.dorsal.any),
    [counts, viewFilter]
  );
  const mantasWithBest = useMemo(
    () => (viewFilter === "ventral" ? counts.ventral.best : counts.dorsal.best),
    [counts, viewFilter]
  );
  const missingCount = Math.max(0, mantasWithAnyView - mantasWithBest);

  const missingLabel =
    viewFilter === "ventral" ? "Missing Best Ventral" : "Missing Best Dorsal";

  const openChooser = async (mantaId: number) => {
    setActiveMantaId(mantaId);
    setModalOpen(true);
    setCandidateLoading(true);
    setSelectedPhotoId(null);
    try {
      const { data, error } = await supabase
        .from("photos")
        .select(
          "pk_photo_id,fk_manta_id,fk_catalog_id,thumbnail_url,storage_path,photo_view,is_best_manta_ventral_photo,is_best_manta_dorsal_photo,uploaded_at,view_label"
        )
        .eq("fk_manta_id", mantaId)
        .eq("photo_view", viewFilter)
        .order("uploaded_at", { ascending: false })
        .order("pk_photo_id", { ascending: false });
      if (error) throw error;
      const candidates = (data as Photo[]) || [];
      setCandidatePhotos(candidates);

      const flagKey =
        viewFilter === "ventral"
          ? "is_best_manta_ventral_photo"
          : "is_best_manta_dorsal_photo";
      const currentBest = candidates.find((p) => !!(p as any)[flagKey]);
      setSelectedPhotoId(currentBest?.pk_photo_id ?? null);
    } catch (e: any) {
      console.error("[BestMantaImageDiagnostics] candidate load error:", e?.message || e);
      toast({ title: "Error", description: e?.message || "Failed to load photos for manta" });
      setCandidatePhotos([]);
    } finally {
      setCandidateLoading(false);
    }
  };

  const setBestForActive = async () => {
    if (!activeMantaId || !selectedPhotoId) return;
    const flagCol =
      viewFilter === "ventral" ? "is_best_manta_ventral_photo" : "is_best_manta_dorsal_photo";
    try {
      const { error: clrErr } = await supabase
        .from("photos")
        .update({ [flagCol]: false })
        .eq("fk_manta_id", activeMantaId)
        .eq("photo_view", viewFilter);
      if (clrErr) throw clrErr;

      const { error: setErr } = await supabase
        .from("photos")
        .update({ [flagCol]: true })
        .eq("pk_photo_id", selectedPhotoId);
      if (setErr) throw setErr;

      await Promise.all([loadPhotos(), loadCounts()]);
      setModalOpen(false);
      toast({ title: "Saved", description: `Best ${viewFilter} set for manta ${activeMantaId}.` });
    } catch (e: any) {
      console.error("[BestMantaImageDiagnostics] set-best error:", e?.message || e);
      toast({ title: "Error", description: e?.message || "Failed to set best photo" });
    }
  };

  return (<Layout>
  <ReviewSubmissionsCard />
      <div className="p-6 space-y-6">
        <div className="text-sm text-muted-foreground pb-2">
          <Link to="/admin" className="underline hover:text-primary">
            ← Back to Admin Dashboard
          </Link>
        </div>

        <div className="bg-blue-600 text-white py-6 px-4 sm:px-8 lg:px-16 rounded-md shadow">
          <h1 className="text-3xl font-bold">Best Manta Photo Check</h1>
          <p className="mt-1 text-white/90 text-sm">
            Ensure each manta has exactly one <span className="font-semibold">{viewFilter}</span> “best” photo.
          </p>
        </div>

        {/* Filter box with counts next to each option */}
        <div className="bg-blue-50 border rounded-xl p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-800 mb-2">
            Filter
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Left: View stack with counts for each option */}
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

            {/* Right: Missing/All stack with counts for the CURRENT view */}
            <div>
              <div className="text-sm font-medium mb-1">Records</div>
              <ToggleGroup
                type="single"
                value={showOnlyMissing ? "missing" : "all"}
                onValueChange={(v) => setShowOnlyMissing(v === "missing")}
                className="flex flex-col items-start gap-2"
              >
                <ToggleGroupItem className="w-full justify-between" value="missing">
                  <span>{viewFilter === "ventral" ? "Missing Best Ventral" : "Missing Best Dorsal"}</span>
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

        {/* Status line BELOW filter box */}
        <div className="text-sm text-blue-800">
          {fmt(rows.length)} records showing of {fmt(mantasWithAnyView)} total records
          {" "}(
          filtered by: View={viewFilter}, Records={showOnlyMissing ? (viewFilter === "ventral" ? "Missing Best Ventral" : "Missing Best Dorsal") : "All"}
          )
          {countsLoading ? <span className="ml-2 text-xs text-muted-foreground">updating counts…</span> : null}
        </div>

        {err && <p className="text-red-600 text-sm">⚠️ {err}</p>}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading photos…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No manta records match the current filter.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {rows.map(({ mantaId, preview, best, count }) => (
              <Card key={mantaId}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">Manta ID: {mantaId}</div>
                    <Badge variant={best ? "default" : "secondary"}>
                      {best ? "Has Best" : "Missing Best"}
                    </Badge>
                  </div>

                  <div className="relative">
                    <img
                      src={preview ? resolveImageUrl(preview) : "/manta-logo.svg"}
                      alt={`Manta ${mantaId}`}
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
                      onClick={() => openChooser(mantaId)}
                    >
                      {best ? "Change" : "Choose"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Modal chooser */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                Select Best {viewFilter.charAt(0).toUpperCase() + viewFilter.slice(1)} Photo
                {activeMantaId ? ` · Manta ${activeMantaId}` : ""}
              </DialogTitle>
            </DialogHeader>

            {candidateLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading photos…
              </div>
            ) : candidatePhotos.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No {viewFilter} photos for this manta.
              </div>
            ) : (
              <RadioGroup
                value={selectedPhotoId?.toString() ?? ""}
                onValueChange={(val) => setSelectedPhotoId(Number(val))}
                className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-2"
              >
                {candidatePhotos.map((p) => {
                  const isBest =
                    viewFilter === "ventral" ? !!p.is_best_manta_ventral_photo : !!p.is_best_manta_dorsal_photo;
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
                        {isBest && <Badge className="ml-auto">Current Best</Badge>}
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
              <Button onClick={setBestForActive} disabled={!activeMantaId || !selectedPhotoId || candidateLoading}>
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
