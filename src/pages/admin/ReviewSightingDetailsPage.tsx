import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "react-hot-toast";
import { CheckCircle } from "lucide-react";

interface TempSighting {
  id: string;
  date: string | null;
  island: string | null;
  sitelocation: string | null;
  photographer: string | null;
  reviewed?: boolean | null;
  total_mantas?: number | null;
}

interface TempManta {
  id: string;
  fk_temp_sighting_id: string;
  suggested_catalog_id: number | null;
  selected_catalog_id: number | null;
  matching_score: number | null;
  match_status: string | null;
  best_photo_id: string | null;
  name: string | null;
  comments: string | null;
  is_new_individual: boolean | null;
  age_class: string | null;
  gender: string | null;
  size_cm: number | null;
}

interface TempPhoto {
  id: string;
  fk_temp_manta_id: string;
  photo_url: string;
  is_best_ventral: boolean | null;
  photo_type: string | null;
}

type CatalogInputState = Record<string, string>;
type CommentInputState = Record<string, string>;

const RESOLVED_STATUSES = ["confirmed", "rejected", "new"];

export default function ReviewSightingDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [sighting, setSighting] = useState<TempSighting | null>(null);
  const [mantas, setMantas] = useState<TempManta[]>([]);
  const [photos, setPhotos] = useState<TempPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingMantaId, setSavingMantaId] = useState<string | null>(null);
  const [catalogInputs, setCatalogInputs] = useState<CatalogInputState>({});
  const [commentInputs, setCommentInputs] = useState<CommentInputState>({});

  const allReviewed = useMemo(
    () => mantas.length > 0 && mantas.every((m) => RESOLVED_STATUSES.includes((m.match_status ?? "").toLowerCase())),
    [mantas],
  );

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;

      setLoading(true);

      const { data: sightingData, error: sightingError } = await supabase
        .from("temp_sightings")
        .select("*")
        .eq("id", id)
        .single();

      if (sightingError) {
        toast.error("Failed to load temp sighting.");
        setLoading(false);
        return;
      }

      const { data: mantasData, error: mantasError } = await supabase
        .from("temp_mantas")
        .select("*")
        .eq("fk_temp_sighting_id", id)
        .order("created_at", { ascending: true });

      if (mantasError) {
        toast.error("Failed to load temp mantas.");
        setLoading(false);
        return;
      }

      const mantaIds = (mantasData ?? []).map((m) => m.id);

      const { data: photosData, error: photosError } = await supabase
        .from("temp_photos")
        .select("*")
        .in("fk_temp_manta_id", mantaIds.length ? mantaIds : ["00000000-0000-0000-0000-000000000000"]);

      if (photosError) {
        toast.error("Failed to load temp photos.");
        setLoading(false);
        return;
      }

      setSighting(sightingData as TempSighting);
      setMantas((mantasData ?? []) as TempManta[]);
      setPhotos((photosData ?? []) as TempPhoto[]);

      const nextCatalogInputs: CatalogInputState = {};
      const nextCommentInputs: CommentInputState = {};

      for (const manta of (mantasData ?? []) as TempManta[]) {
        nextCatalogInputs[manta.id] =
          manta.selected_catalog_id != null
            ? String(manta.selected_catalog_id)
            : manta.suggested_catalog_id != null
              ? String(manta.suggested_catalog_id)
              : "";

        nextCommentInputs[manta.id] = manta.comments ?? "";
      }

      setCatalogInputs(nextCatalogInputs);
      setCommentInputs(nextCommentInputs);
      setLoading(false);
    };

    void loadData();
  }, [id]);

  const refreshMantas = async () => {
    if (!id) return;

    const { data, error } = await supabase
      .from("temp_mantas")
      .select("*")
      .eq("fk_temp_sighting_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Failed to refresh manta review state.");
      return;
    }

    const refreshed = (data ?? []) as TempManta[];
    setMantas(refreshed);

    const nextCatalogInputs: CatalogInputState = {};
    const nextCommentInputs: CommentInputState = {};

    for (const manta of refreshed) {
      nextCatalogInputs[manta.id] =
        manta.selected_catalog_id != null
          ? String(manta.selected_catalog_id)
          : manta.suggested_catalog_id != null
            ? String(manta.suggested_catalog_id)
            : "";

      nextCommentInputs[manta.id] = manta.comments ?? "";
    }

    setCatalogInputs(nextCatalogInputs);
    setCommentInputs(nextCommentInputs);

    const everyReviewed =
      refreshed.length > 0 &&
      refreshed.every((m) => RESOLVED_STATUSES.includes((m.match_status ?? "").toLowerCase()));

    if (everyReviewed) {
      await supabase
        .from("temp_sightings")
        .update({ reviewed: true })
        .eq("id", id);
    } else {
      await supabase
        .from("temp_sightings")
        .update({ reviewed: false })
        .eq("id", id);
    }
  };

  const updateCatalogInput = (mantaId: string, value: string) => {
    setCatalogInputs((prev) => ({ ...prev, [mantaId]: value }));
  };

  const updateCommentInput = (mantaId: string, value: string) => {
    setCommentInputs((prev) => ({ ...prev, [mantaId]: value }));
  };

  const saveMatchDecision = async (mantaId: string) => {
    const rawValue = String(catalogInputs[mantaId] ?? "").trim();

    if (!rawValue) {
      toast.error("Enter a catalog ID before confirming a match.");
      return;
    }

    const parsed = Number(rawValue);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      toast.error("Catalog ID must be a positive integer.");
      return;
    }

    setSavingMantaId(mantaId);

    const { error } = await supabase
      .from("temp_mantas")
      .update({
        match_status: "confirmed",
        selected_catalog_id: parsed,
        is_new_individual: false,
        comments: commentInputs[mantaId] ?? null,
      })
      .eq("id", mantaId);

    setSavingMantaId(null);

    if (error) {
      toast.error("Failed to save confirmed match.");
      return;
    }

    toast.success(`Saved match to catalog ${parsed}.`);
    await refreshMantas();
  };

  const saveNewDecision = async (mantaId: string) => {
    setSavingMantaId(mantaId);

    const { error } = await supabase
      .from("temp_mantas")
      .update({
        match_status: "new",
        selected_catalog_id: null,
        is_new_individual: true,
        comments: commentInputs[mantaId] ?? null,
      })
      .eq("id", mantaId);

    setSavingMantaId(null);

    if (error) {
      toast.error("Failed to mark manta as new.");
      return;
    }

    toast.success("Marked as new individual.");
    await refreshMantas();
  };

  const saveRejectedDecision = async (mantaId: string) => {
    setSavingMantaId(mantaId);

    const { error } = await supabase
      .from("temp_mantas")
      .update({
        match_status: "rejected",
        selected_catalog_id: null,
        is_new_individual: false,
        comments: commentInputs[mantaId] ?? null,
      })
      .eq("id", mantaId);

    setSavingMantaId(null);

    if (error) {
      toast.error("Failed to reject manta.");
      return;
    }

    toast.success("Marked as rejected.");
    await refreshMantas();
  };

  if (loading) {
    return (
      <Layout>
        <p className="p-4">Loading sighting details...</p>
      </Layout>
    );
  }

  if (!sighting) {
    return (
      <Layout>
        <p className="p-4 text-red-600">Sighting not found.</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Review Sighting</h1>
            <p className="text-muted-foreground">
              {sighting.date ?? "—"} · {sighting.island ?? "—"} · {sighting.sitelocation ?? "—"}
            </p>
            <p className="text-sm text-muted-foreground">
              Photographer: {sighting.photographer ?? "—"}
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/admin/review")}>
              Back to Queue
            </Button>
          </div>
        </div>

        <Card className="p-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="font-medium">Submission ID:</span> {sighting.id}
            </div>
            <div>
              <span className="font-medium">Total mantas:</span> {mantas.length}
            </div>
            <div>
              <span className="font-medium">Reviewed:</span>{" "}
              {allReviewed ? "Yes" : "No"}
            </div>
          </div>
        </Card>

        {mantas.map((manta, index) => {
          const mantaPhotos = photos.filter((p) => p.fk_temp_manta_id === manta.id);
          const bestPhoto =
            mantaPhotos.find((p) => p.id === manta.best_photo_id) ||
            mantaPhotos.find((p) => p.is_best_ventral) ||
            mantaPhotos[0] ||
            null;

          const normalizedStatus = (manta.match_status ?? "").toLowerCase();
          const isResolved = RESOLVED_STATUSES.includes(normalizedStatus);

          return (
            <Card key={manta.id} className="p-4 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    Manta {index + 1}: {manta.name || "Unnamed"}
                    {isResolved ? <CheckCircle size={18} className="text-green-600" /> : null}
                  </h2>
                  <div className="mt-1 text-sm text-muted-foreground space-y-1">
                    <p>Temp manta ID: {manta.id}</p>
                    <p>Suggested catalog ID: {manta.suggested_catalog_id ?? "—"}</p>
                    <p>Selected catalog ID: {manta.selected_catalog_id ?? "—"}</p>
                    <p>Match score: {manta.matching_score != null ? manta.matching_score.toFixed(4) : "—"}</p>
                    <p>Status: {manta.match_status ?? "unresolved"}</p>
                    <p>Marked new individual: {manta.is_new_individual ? "Yes" : "No"}</p>
                  </div>
                </div>

                {bestPhoto ? (
                  <img
                    src={bestPhoto.photo_url}
                    alt="best manta"
                    className="w-56 rounded border object-cover"
                  />
                ) : (
                  <div className="w-56 h-40 rounded border grid place-items-center text-sm text-muted-foreground">
                    No photo
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div>
                    <div className="font-medium">Admin match decision</div>
                    <div className="text-muted-foreground">
                      Enter the confirmed catalog ID if this is a resight.
                    </div>
                  </div>

                  <Input
                    value={catalogInputs[manta.id] ?? ""}
                    onChange={(e) => updateCatalogInput(manta.id, e.target.value)}
                    placeholder="Confirmed catalog ID"
                    inputMode="numeric"
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => void saveMatchDecision(manta.id)}
                      disabled={savingMantaId === manta.id}
                    >
                      Confirm Match
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => void saveNewDecision(manta.id)}
                      disabled={savingMantaId === manta.id}
                    >
                      Mark New Individual
                    </Button>

                    <Button
                      variant="destructive"
                      onClick={() => void saveRejectedDecision(manta.id)}
                      disabled={savingMantaId === manta.id}
                    >
                      Reject
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <div className="font-medium">Admin notes</div>
                    <div className="text-muted-foreground">
                      Optional notes for why the match was accepted, rejected, or marked new.
                    </div>
                  </div>

                  <textarea
                    value={commentInputs[manta.id] ?? ""}
                    onChange={(e) => updateCommentInput(manta.id, e.target.value)}
                    className="w-full min-h-[110px] rounded-md border px-3 py-2 text-sm"
                    placeholder="Admin review notes"
                  />
                </div>
              </div>

              {mantaPhotos.length > 1 ? (
                <div className="space-y-2">
                  <div className="font-medium text-sm">All uploaded photos</div>
                  <div className="flex flex-wrap gap-3">
                    {mantaPhotos.map((photo) => (
                      <div key={photo.id} className="space-y-1">
                        <img
                          src={photo.photo_url}
                          alt={photo.id}
                          className="w-28 h-28 rounded border object-cover"
                        />
                        <div className="text-[11px] text-muted-foreground max-w-28 break-all">
                          {photo.id}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </Card>
          );
        })}

        <Card className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium">Commit readiness</div>
              <div className="text-sm text-muted-foreground">
                Commit should only be allowed when every manta is resolved.
              </div>
            </div>
            <div className={`text-sm font-medium ${allReviewed ? "text-green-700" : "text-amber-700"}`}>
              {allReviewed ? "Ready to commit" : "Still unresolved"}
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
