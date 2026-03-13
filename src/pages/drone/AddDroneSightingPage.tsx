import React, { useEffect, useMemo, useRef, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import DronePhotosModal, { type UploadedDronePhoto } from "@/components/drone/DronePhotosModal";
import IslandLocationSelect from "@/components/drone/IslandLocationSelect";
import { supabase } from "@/lib/supabase";
import { Link, useNavigate } from "react-router-dom";
import { useIslandsLocations } from "@/lib/useIslandsLocations";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

function uuid() {
  try {
    return (crypto as any).randomUUID();
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

function buildTimes(stepMin = 5) {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += stepMin) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const TIME_OPTIONS = buildTimes(5);
const EMAIL_RE = /^\S+@\S+\.\S+$/;

type PendingExif = {
  date?: string;
  time?: string;
  lat?: number;
  lon?: number;
};

export default function AddDroneSightingPage() {
  const navigate = useNavigate();

  const [date, setDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [timesUnknown, setTimesUnknown] = useState<boolean>(false);
  const [lat, setLat] = useState<string>("");
  const [lon, setLon] = useState<string>("");

  const [pilot, setPilot] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<string>("");

  const [island, setIsland] = useState<string>("");
  const [location, setLocation] = useState<string>("");

  const [notes, setNotes] = useState<string>("");
  const [noMantasSeen, setNoMantasSeen] = useState<boolean>(false);
  const [totalMantasObserved, setTotalMantasObserved] = useState<string>("");

  const draftId = useMemo(() => uuid(), []);
  const [photos, setPhotos] = useState<UploadedDronePhoto[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [confirmExifOpen, setConfirmExifOpen] = useState(false);
  const [pendingExif, setPendingExif] = useState<PendingExif | null>(null);

  const [suggestedIsland, setSuggestedIsland] = useState<string | null>(null);
  const [suggestedLocation, setSuggestedLocation] = useState<string | null>(null);
  const [suggestionNote, setSuggestionNote] = useState<string | null>(null);

  const [timesPromptOpen, setTimesPromptOpen] = useState(false);

  const startTimeRef = useRef<HTMLSelectElement | null>(null);

  const { islands } = useIslandsLocations("");
  const { locations } = useIslandsLocations(island);

  const emailValid = EMAIL_RE.test(email.trim());
  const hasPhotos = photos.length > 0;
  const allPhotoCountsFilled = photos.every((p) => p.total_mantas != null && Number.isFinite(Number(p.total_mantas)));

  useEffect(() => {
    if (noMantasSeen) {
      setTotalMantasObserved("0");
    }
  }, [noMantasSeen]);

  useEffect(() => {
    if (!pendingExif || typeof pendingExif.lat !== "number" || typeof pendingExif.lon !== "number") return;
    if (!islands.length) return;

    const candidates = [
      { name: "Big Island", lat: 19.6, lon: -155.5 },
      { name: "Maui", lat: 20.8, lon: -156.3 },
      { name: "Oahu", lat: 21.48, lon: -157.97 },
      { name: "Kauai", lat: 22.05, lon: -159.5 },
      { name: "Molokai", lat: 21.13, lon: -157.03 },
      { name: "Lanai", lat: 20.83, lon: -156.92 },
      { name: "Niihau", lat: 21.9, lon: -160.15 },
    ];

    let best: { name: string; dist: number } | null = null;
    for (const c of candidates) {
      const d = haversineMeters(pendingExif.lat, pendingExif.lon, c.lat, c.lon);
      if (!best || d < best.dist) best = { name: c.name, dist: d };
    }

    const guessed = best?.name ?? null;
    if (guessed && !suggestedIsland) {
      const found = islands.find((x) => x.toLowerCase() === guessed.toLowerCase());
      if (found) setSuggestedIsland(found);
    }
  }, [pendingExif, islands, suggestedIsland]);

  useEffect(() => {
    if (!pendingExif || typeof pendingExif.lat !== "number" || typeof pendingExif.lon !== "number") return;
    if (!island || !locations.length) return;

    let best: { name: string; dist: number } | null = null;
    for (const locRec of locations) {
      if (typeof locRec.latitude !== "number" || typeof locRec.longitude !== "number") continue;
      const d = haversineMeters(pendingExif.lat, pendingExif.lon, locRec.latitude, locRec.longitude);
      if (!best || d < best.dist) best = { name: locRec.name, dist: d };
    }

    if (best) {
      setSuggestedLocation(best.name);
      setSuggestionNote(`Suggested from photo metadata${best.dist < 5000 ? "" : " (nearest known location)"}.`);
    }
  }, [pendingExif, island, locations]);

  function applyExifMetadata() {
    if (!pendingExif) return;

    if (pendingExif.date && !date) setDate(pendingExif.date);
    if (typeof pendingExif.lat === "number" && !lat) setLat(pendingExif.lat.toFixed(6));
    if (typeof pendingExif.lon === "number" && !lon) setLon(pendingExif.lon.toFixed(6));

    if (suggestedIsland && !island) {
      setIsland(suggestedIsland);
      setLocation("");
    }

    setConfirmExifOpen(false);
  }

  useEffect(() => {
    if (!island) return;
    if (suggestedLocation && !location && locations.some((l) => l.name === suggestedLocation)) {
      setLocation(suggestedLocation);
    }
  }, [island, suggestedLocation, location, locations]);

  const canSubmit =
    pilot.trim().length > 0 &&
    emailValid &&
    date.trim().length > 0 &&
    island.trim().length > 0 &&
    location.trim().length > 0 &&
    (hasPhotos || noMantasSeen) &&
    (!hasPhotos || allPhotoCountsFilled);

  async function actuallySubmit() {
    const totalMantas =
      totalMantasObserved.trim() === ""
        ? null
        : Number.isFinite(Number(totalMantasObserved))
          ? Number(totalMantasObserved)
          : null;

    const { data: sight, error: e1 } = await supabase
      .from("temp_drone_sightings")
      .insert({
        pilot: pilot || null,
        email: email || null,
        phone: phone || null,
        date: date || null,
        time: null,
        start_time: startTime || null,
        end_time: endTime || null,
        times_unknown: timesUnknown,
        no_mantas_seen: noMantasSeen,
        total_mantas_observed: totalMantas,
        island: island || null,
        location: location || null,
        latitude: lat ? Number(lat) : null,
        longitude: lon ? Number(lon) : null,
        notes: notes || null,
        status: "pending",
      })
      .select("id")
      .single();

    if (e1 || !sight) {
      console.error("[AddDroneSurvey] insert survey failed", e1?.message);
      window.alert("Failed to save draft.");
      return;
    }

    if (photos.length) {
      const rows = photos.map((p) => ({
        draft_id: sight.id,
        path: p.path,
        url: p.url || null,
        taken_date: p.date || null,
        taken_time: p.time || null,
        lat: typeof p.lat === "number" ? p.lat : null,
        lon: typeof p.lon === "number" ? p.lon : null,
        total_mantas: Number.isFinite(p.total_mantas as any) ? Number(p.total_mantas) : null,
      }));

      const { error: e2 } = await supabase.from("temp_drone_photos").insert(rows);
      if (e2) {
        console.error("[AddDroneSurvey] insert photos failed", e2.message);
        window.alert("Draft saved, but photo rows failed to save.");
        return;
      }
    }

    window.alert("Drone survey submitted for admin review.");
    navigate("/browse/drone");
  }

  async function handleSubmitLocal() {
    if (!canSubmit) return;

    if (!timesUnknown && !startTime && !endTime) {
      setTimesPromptOpen(true);
      return;
    }

    try {
      await actuallySubmit();
    } catch (err: any) {
      console.error("[AddDroneSurvey] submit error", err?.message || String(err));
      window.alert("Error saving draft.");
    }
  }

  function removePhoto(id: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }

  function updatePhotoMantas(id: string, n: number) {
    setPhotos((prev) =>
      prev.map((p) => p.id === id ? { ...p, total_mantas: Number.isFinite(n) ? n : null } : p)
    );
  }

  function handlePhotosAdded(items: UploadedDronePhoto[], firstExif?: PendingExif | null) {
    setPhotos((prev) => [...prev, ...items]);

    if (
      firstExif &&
      (firstExif.date || typeof firstExif.lat === "number" || typeof firstExif.lon === "number")
    ) {
      setPendingExif(firstExif);
      setSuggestedIsland(null);
      setSuggestedLocation(null);
      setSuggestionNote(null);
      setConfirmExifOpen(true);
    }
  }

  return (
    <Layout>
      <div className="bg-gradient-to-r from-sky-600 to-blue-700 py-8 text-white text-center">
        <h1 className="text-3xl font-semibold">Add Drone Survey</h1>
        <div className="text-xs opacity-90 mt-1">draft: {draftId.slice(0, 8)}</div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-3 text-sm">
        <Link to="/dashboard" className="text-blue-700 underline">
          Dashboard
        </Link>
        <span className="text-slate-600"> / Add Drone Survey</span>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-3 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Survey Details</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-3">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border rounded px-3 py-2"
            />
            <select
              ref={startTimeRef}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="border rounded px-3 py-2"
            >
              <option value="">Start Time</option>
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="border rounded px-3 py-2"
            >
              <option value="">End Time</option>
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <input
              placeholder="Drone Pilot"
              value={pilot}
              onChange={(e) => setPilot(e.target.value)}
              className="border rounded px-3 py-2"
            />
            <input
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border rounded px-3 py-2"
            />
            <input
              placeholder="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="border rounded px-3 py-2"
            />

            <div className="md:col-span-3 flex items-center gap-2 pt-1">
              <input
                id="times-unknown"
                type="checkbox"
                checked={timesUnknown}
                onChange={(e) => setTimesUnknown(e.target.checked)}
              />
              <label htmlFor="times-unknown" className="text-sm">
                Times Unknown
              </label>
            </div>
          </CardContent>
        </Card>

        <IslandLocationSelect
          island={island}
          setIsland={setIsland}
          location={location}
          setLocation={setLocation}
          lat={lat}
          setLat={setLat}
          lon={lon}
          setLon={setLon}
          suggestedIsland={suggestedIsland}
          suggestedLocation={suggestedLocation}
          suggestionNote={suggestionNote}
        />

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              className="w-full min-h-[120px] border rounded px-3 py-2"
              placeholder="Observations, weather, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Photos Added ({photos.length})</CardTitle>
            <Button onClick={() => setModalOpen(true)} disabled={noMantasSeen}>
              Add Photos
            </Button>
          </CardHeader>
          <CardContent>
            {noMantasSeen ? (
              <div className="text-sm text-muted-foreground">
                No-manta survey selected. Photo upload is disabled.
              </div>
            ) : photos.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No photos yet. Click <em>Add Photos</em> to upload.
              </div>
            ) : (
              <div className="space-y-2">
                {photos.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 border rounded p-2">
                    <img src={p.url} className="h-14 w-14 object-cover rounded" alt={p.name} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {(p.date || "—")}
                        {p.time ? ` ${p.time}` : ""}
                        {" • "}
                        {p.lat != null ? p.lat.toFixed(6) : "—"}
                        {", "}
                        {p.lon != null ? p.lon.toFixed(6) : "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs">Mantas</label>
                      <input
                        className="w-16 border rounded px-2 py-1 text-sm"
                        inputMode="numeric"
                        value={p.total_mantas ?? ""}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          updatePhotoMantas(p.id, n);
                        }}
                        placeholder="0"
                      />
                    </div>
                    <button
                      className="px-2 py-1 border rounded text-red-600"
                      onClick={() => removePhoto(p.id)}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-end gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Total Mantas Observed</label>
                <input
                  className="w-20 border rounded px-3 py-2"
                  inputMode="numeric"
                  value={totalMantasObserved}
                  onChange={(e) => setTotalMantasObserved(e.target.value)}
                  disabled={noMantasSeen}
                  placeholder="0"
                />
              </div>

              <div className="flex items-center gap-2 pb-2">
                <input
                  id="no-mantas-seen"
                  type="checkbox"
                  checked={noMantasSeen}
                  onChange={(e) => setNoMantasSeen(e.target.checked)}
                />
                <label htmlFor="no-mantas-seen" className="text-sm">
                  No Mantas Seen
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center mt-6 gap-2">
          <Button variant="outline" onClick={() => window.history.back()}>
            Cancel
          </Button>
          <Button onClick={handleSubmitLocal} disabled={!canSubmit}>
            Submit Survey
          </Button>
        </div>

        <div className="mx-auto mt-2 max-w-5xl px-4 text-[10px] text-muted-foreground">
          probe:add-drone-survey v5
        </div>
      </div>

      <DronePhotosModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        draftId={draftId}
        onAdd={handlePhotosAdded}
      />

      <Dialog open={confirmExifOpen} onOpenChange={setConfirmExifOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Use photo metadata?</DialogTitle>
            <DialogDescription>
              This photo includes metadata that may help populate survey date and location.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm">
            {pendingExif?.date && <div>Date: {pendingExif.date}</div>}
            {typeof pendingExif?.lat === "number" && typeof pendingExif?.lon === "number" && (
              <div>
                Coordinates: {pendingExif.lat.toFixed(6)}, {pendingExif.lon.toFixed(6)}
              </div>
            )}
            {suggestedIsland && <div>Suggested island: {suggestedIsland}</div>}
            {suggestedLocation && <div>Suggested location: {suggestedLocation}</div>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmExifOpen(false)}>
              No, I'll enter manually
            </Button>
            <Button onClick={applyExifMetadata}>
              Yes, use metadata
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={timesPromptOpen} onOpenChange={setTimesPromptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Please add survey start and stop times</DialogTitle>
            <DialogDescription>
              Add times if you know them. If you do not know them, choose Times Unknown.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setTimesUnknown(true);
                setTimesPromptOpen(false);
              }}
            >
              Times Unknown
            </Button>
            <Button
              onClick={() => {
                setTimesPromptOpen(false);
                requestAnimationFrame(() => startTimeRef.current?.focus());
              }}
            >
              Add Times
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
