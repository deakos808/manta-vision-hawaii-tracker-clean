import React, { useEffect, useMemo, useRef, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import MatchModal from "@/components/mantas/MatchModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import UnifiedMantaModal, { type MantaDraft, type Uploaded } from "@/components/mantas/UnifiedMantaModal";
import PhotoEditModal from "@/components/mantas/PhotoEditModal";
import MantasList from "@/components/mantas/MantasList";
import { supabase } from "@/lib/supabase";
import TempSightingMap from "@/components/map/TempSightingMap";
import { saveReviewServer } from "@/utils/reviewSave";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { resolvePhotoUrl } from "@/lib/photoUrl";

function uuid(){ try { return (crypto as any).randomUUID(); } catch { return Math.random().toString(36).slice(2); } }
function buildTimes(stepMin=5){ const out:string[]=[]; for(let h=0;h<24;h++){ for(let m=0;m<60;m+=stepMin){ out.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);} } return out; }
const TIME_OPTIONS = buildTimes(5);

// helpers
const useTotalPhotos = (mantas:any[]) => (mantas ?? []).reduce((n,m:any)=> n + (Array.isArray(m?.photos) ? m.photos.length : 0), 0);
type LocRec = { id: string; name: string; island?: string; latitude?: number|null; longitude?: number|null };
type PendingExif = { date?: string; time?: string; lat?: number; lon?: number };

type ExifSuggestion = PendingExif & {
  suggestedIsland?: string | null;
  suggestedLocation?: string | null;
};

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

function mantaTempName(index: number) {
  let n = index;
  let name = "";
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

function mantaOrdinalLabel(index: number) {
  const labels = ["First Manta", "Second Manta", "Third Manta", "Fourth Manta", "Fifth Manta", "Sixth Manta"];
  return labels[index] || `Manta ${index + 1}`;
}

export default function AddSightingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { role } = useUserRole();
  const canMeasureMantas = role === "admin";

  const [reviewId, setReviewId] = useState<string | null>(null);
  const isReview = !!reviewId;

  // return path (Admin review queue by default)
  const returnPath = useMemo(() => {
    try {
      const sp = new URLSearchParams(location.search);
      return sp.get("return") || "/admin/review";
    } catch { return "/admin/review"; }
  }, [location.search]);

  // Match modal state
  const [pageMatchOpen, setPageMatchOpen] = useState(false);
  const [pageMatchUrl, setPageMatchUrl] = useState<string>("");
  const [pageMatchMeta, setPageMatchMeta] = useState<{name?:string; gender?:string|null; ageClass?:string|null; meanSize?:number|string|null}>({});
  const [pageMatchFor, setPageMatchFor] = useState<string | null>(null);

  // Mantas
  const [mantas, setMantas] = useState<MantaDraft[]>([]);
  const totalPhotos = useMemo(() => useTotalPhotos(mantas as any), [mantas]);
  const [selectedMantaIds, setSelectedMantaIds] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editingManta, setEditingManta] = useState<MantaDraft|null>(null);
  const [editingPhoto, setEditingPhoto] = useState<{ mantaId: string; photo: Uploaded } | null>(null);
  const [replacingPhoto, setReplacingPhoto] = useState<{ mantaId: string; photo: Uploaded } | null>(null);
  const replacePhotoInputRef = useRef<HTMLInputElement | null>(null);

  // Sighting details
  const [date, setDate] = useState<string>("");
  const [dateUnknown, setDateUnknown] = useState(false);
  const [startTime, setStartTime] = useState<string>("");
  const [stopTime, setStopTime] = useState<string>("");

  // Contact
  const [photographer, setPhotographer] = useState("");
  const [photographerUnknown, setPhotographerUnknown] = useState(false);
  const [email, setEmail] = useState("");
  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState<string>("");

  // Location
  const [island, setIsland] = useState("");
  const [islands, setIslands] = useState<string[]>([]);

useEffect(() => {
  let alive = true;
  (async () => {
    try {
      setIslandsLoading(true); setIslandsError(null);
      const { data, error } = await supabase
        .from('islands_distinct')
        .select('island')
        .order('island', { ascending: true });
      if (!alive) return;
      if (error) { setIslandsError(error.message); setIslandsLoading(false); return; }
      const list = (data ?? []).map((r:any)=> String(r.island).trim()).filter(Boolean);
      const uniq = Array.from(new Set(list));
      setIslands(uniq);
      setIslandsLoading(false);
      console.info('[IslandsSelect][fetch] from view:', uniq);
    } catch(e:any) {
      if (!alive) return;
      setIslandsError(e?.message || String(e)); setIslandsLoading(false);
    }
  })();
  return ()=>{ alive=false; };
}, []);

const [islandsLoading, setIslandsLoading] = useState<boolean>(true);
  const [islandsError, setIslandsError] = useState<string|null>(null);

  const [locList, setLocList] = useState<LocRec[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [locationName, setLocationName] = useState<string>("");
  const [locationUnknown, setLocationUnknown] = useState(false);
  const [addingLoc, setAddingLoc] = useState(false);
  const [newLoc, setNewLoc] = useState("");

  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");
  const [coordSource, setCoordSource] = useState<string>("");

  const [confirmExifOpen, setConfirmExifOpen] = useState(false);
  const [exifSuggestion, setExifSuggestion] = useState<ExifSuggestion | null>(null);

  const [successOpen, setSuccessOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [morePhotosManta, setMorePhotosManta] = useState<MantaDraft | null>(null);
  const [mantaAddedMessage, setMantaAddedMessage] = useState("");

  const [mapOpen, setMapOpen] = useState(false);
  const formSightingId = useMemo(()=>uuid(),[]);
  const totalPhotosAll = useMemo(() => (mantas ?? []).reduce((a,m)=> a + (Array.isArray((m as any).photos) ? (m as any).photos.length : 0), 0), [mantas]);
  const dateValid  = dateUnknown || /^\d{4}-\d{2}-\d{2}$/.test(String(date || "").trim());
  const photographerValid = photographerUnknown || photographer.trim().length > 0;
  const locationValid = locationUnknown || !!String(locationId || locationName).trim();
  const canSubmit = dateValid && photographerValid && emailValid && locationValid;

  useEffect(()=>{ console.log("[AddSighting] mounted"); }, []);

  // Hydrate reviewId from state/query/window (robust)
  useEffect(() => {
    if (reviewId) return;
    let rid: string | null = null;
    try {
      const stateRid = (location as any)?.state?.reviewId ?? null;
      const queryRid = searchParams.get("review") || searchParams.get("reviewId");
      const winRid = (() => {
        try { const sp = new URLSearchParams(window.location.search); return sp.get("review") || sp.get("reviewId"); }
        catch { return null; }
      })();
      rid = (stateRid as any) || (queryRid as any) || (winRid as any) || null;
    } catch {}
    if (rid) { console.info("[AddSighting][review] init rid", rid); setReviewId(String(rid)); }
  }, [reviewId, location.state, location.search, searchParams]);

  // Fetch review payload
  useEffect(() => {
    if (!reviewId) return;
    (async () => {
      console.info("[AddSighting][review] fetch start", reviewId);
      try {
        const { data, error } = await supabase
          .from("sighting_submissions")
          .select("id,email,sighting_date,submitted_at,status,payload")
          .eq("id", reviewId)
          .single();
        if (error || !data) { console.warn("[AddSighting][review] fetch error", error?.message); return; }
        const anyd: any = data;
        setEmail(anyd.email || "");
        if (anyd.sighting_date) setDate(String(anyd.sighting_date));
        const p = (anyd.payload || {}) as any;
        if (p.startTime) setStartTime(String(p.startTime));
        if (p.stopTime) setStopTime(String(p.stopTime));
        if (p.locationId) setLocationId(String(p.locationId));
        if (p.locationName) setLocationName(String(p.locationName));
        if (p.notes) setNotes(p.notes);
        if (p.photographer) setPhotographer(p.photographer);
        if (p.phone) setPhone(p.phone);
        if (p.island) setIsland(p.island);
        if (p.latitude != null) setLat(String(p.latitude));
        if (p.longitude != null) setLng(String(p.longitude));
        if (Array.isArray(p.mantas)) {
          setMantas(p.mantas.map((m:any) => ({
            id: m.id || uuid(),
            name: m.name || "",
            species: m.species === "birostris" ? "birostris" : "alfredi",
            gender: m.gender ?? null,
            ageClass: m.ageClass ?? null,
            size: m.size ?? null,
            photos: Array.isArray(m.photos) ? m.photos : [],
            matchedCatalogId: m.matchedCatalogId ?? m.potentialCatalogId ?? null,
            noMatch: !!(m.noMatch ?? m.potentialNoMatch),
            noPhotos: !!m.noPhotos,
          })));
        }
        console.info("[AddSighting][review] hydrated", anyd.email, anyd.sighting_date);
      } catch (e:any) {
        console.warn("[AddSighting][review] exception", e?.message || e);
      }
    })();
  }, [reviewId]);

  // Secondary loaders for reviewId (state/search)
  useEffect(() => {
    try {
      const st = (location as any)?.state as any;
      const rid = st?.reviewId;
      if (rid && rid !== reviewId) setReviewId(String(rid));
    } catch {}
  }, [location.state]);
  useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search);
      const rv = sp.get("review") || sp.get("reviewId");
      if (rv && rv !== reviewId) setReviewId(rv);
    } catch {}
  }, [location.search]);

  // Load islands (distinct from sightings)
  // Load locations for selected island (location_defaults, fallback to sightings)
  useEffect(()=>{
    let cancelled=false;
    (async ()=>{
      const isl = island?.trim();
      if(!isl){ setLocList([]); setLocationId(""); setLocationName(""); return; }
      try{
        const { data, error } = await supabase
          .from("location_defaults")
          .select("name,island,latitude,longitude")
          .eq("island", isl).order("name",{ascending:true});
        if(!cancelled && !error && data && data.length){
          const seen = new Set<string>(); const list:LocRec[]=[];
          for(const r of data){
            const key = (r.name||"").trim().toLowerCase();
            if(!seen.has(key)){
              seen.add(key);
              list.push({ id: String(r.name), name: String(r.name), island: r.island, latitude: r.latitude ?? null, longitude: r.longitude ?? null });
            }
          }
          setLocList(list);
          return;
        }
      }catch(e){ console.warn("[AddSighting] location_defaults failed", e); }
      try{
        const { data: srows, error: serr } = await supabase
          .from("sightings").select("sitelocation").eq("island", isl).not("sitelocation","is", null);
        if(!cancelled && !serr && srows){
          const names = Array.from(new Set(srows.map((r:any)=>(r.sitelocation||"").toString().trim()).filter((n:string)=>n.length>0))).sort((a,b)=>a.localeCompare(b));
          setLocList(names.map((n:string)=>({ id:n, name:n, island:isl })));
          return;
        }
      }catch(e){ console.warn("[AddSighting] fallback distinct sights failed", e); }
      setLocList(["Keauhou Bay","Kailua Pier","Māʻalaea Harbor","Honokōwai"].map(n=>({id:n,name:n,island:isl})));
    })();
    return ()=>{ cancelled=true; };
  },[island]);
  // AUTO_ADD_SAVED_LOCATION: make sure saved locationId is present in options
  useEffect(() => {
    try {
      if (!island || !locationId) return;
      const found = (locList || []).some(l => String(l.id) === String(locationId));
      if (!found) {
        setLocList(prev => [{ id: String(locationId), name: locationName || String(locationId), island }, ...(prev || [])]);
      }
    } catch {}
  }, [island, locationId, locationName, locList]);


  async function fetchEarliestCoords(isl: string, loc: string): Promise<{lat:number; lon:number} | null> {
    try{
      const { data, error } = await supabase
        .from("sightings")
        .select("latitude,longitude,sighting_date,pk_sighting_id")
        .eq("island", isl).ilike("sitelocation", loc)
        .not("latitude","is", null).not("longitude","is", null)
        .order("sighting_date", { ascending: true }).order("pk_sighting_id", { ascending: true }).limit(1);
      if(error || !data || !data.length) return null;
      const r = data[0]; const la = Number(r.latitude), lo = Number(r.longitude);
      if(!Number.isFinite(la) || !Number.isFinite(lo)) return null;
      return { lat: la, lon: lo };
    }catch(e){ console.warn("[AddSighting] fetchEarliestCoords failed", e); return null; }
  }


  async function prepareExifSuggestion(meta: PendingExif): Promise<ExifSuggestion | null> {
    let bestIsland: string | null = null;
    let bestLocation: string | null = null;

    if (typeof meta.lat === "number" && typeof meta.lon === "number") {
      try {
        const { data } = await supabase
          .from("location_defaults")
          .select("name,island,latitude,longitude");

        const rows = (data || []).filter(
          (r: any) => typeof r.latitude === "number" && typeof r.longitude === "number"
        );

        let best: any = null;
        for (const r of rows) {
          const d = haversineMeters(meta.lat, meta.lon, r.latitude, r.longitude);
          if (!best || d < best.dist) best = { dist: d, row: r };
        }

        if (best?.row) {
          bestIsland = String(best.row.island || "").trim() || null;
          bestLocation = String(best.row.name || "").trim() || null;
        }
      } catch (e) {
        console.warn("[AddSighting][EXIF] location_defaults lookup failed", e);
      }
    }

    if (!bestIsland && typeof meta.lat === "number" && typeof meta.lon === "number") {
      const centers = [
        { name: "Big Island", lat: 19.6, lon: -155.5 },
        { name: "Maui", lat: 20.8, lon: -156.3 },
        { name: "Oahu", lat: 21.48, lon: -157.97 },
        { name: "Kauai", lat: 22.05, lon: -159.5 },
        { name: "Molokai", lat: 21.13, lon: -157.03 },
        { name: "Lanai", lat: 20.83, lon: -156.92 },
        { name: "Niihau", lat: 21.9, lon: -160.15 },
        { name: "Kahoolawe", lat: 20.55, lon: -156.6 },
      ];

      let best: any = null;
      for (const c of centers) {
        const d = haversineMeters(meta.lat, meta.lon, c.lat, c.lon);
        if (!best || d < best.dist) best = { dist: d, name: c.name };
      }
      bestIsland = best?.name ?? null;
    }

    const suggestion: ExifSuggestion = {
      date: meta.date,
      time: meta.time,
      lat: meta.lat,
      lon: meta.lon,
      suggestedIsland: bestIsland,
      suggestedLocation: bestLocation,
    };

    console.log("[AddSighting][EXIF] prepareExifSuggestion result", suggestion);
    setExifSuggestion(suggestion);
    setConfirmExifOpen(true);
    return suggestion;
  }

  function applyExifMetadata(meta: ExifSuggestion) {
    console.log("[AddSighting][EXIF] applyExifMetadata", meta);

    if (meta.date && (!String(date || "").trim() || dateUnknown)) {
      setDate(meta.date);
      setDateUnknown(false);
    }
    if (meta.time && !String(startTime || "").trim()) setStartTime(meta.time);
    if (typeof meta.lat === "number" && (!String(lat || "").trim() || locationUnknown)) setLat(String(Number(meta.lat).toFixed(5)));
    if (typeof meta.lon === "number" && (!String(lng || "").trim() || locationUnknown)) setLng(String(Number(meta.lon).toFixed(5)));

    if (meta.suggestedIsland && (!String(island || "").trim() || locationUnknown)) {
      setIsland(meta.suggestedIsland);
      setLocationUnknown(false);
    }
    if (meta.suggestedLocation && (!String(locationId || "").trim() || locationUnknown)) {
      setLocationId(meta.suggestedLocation);
      setLocationName(meta.suggestedLocation);
      setLocationUnknown(false);
    }

    setConfirmExifOpen(false);
    setExifSuggestion(null);
  }

  // On location change, autofill coords
  useEffect(()=>{
    if(!locationId) return;
    const rec = locList.find(l => l.id === locationId) || locList.find(l => l.name === locationId);
    const displayName = rec?.name ?? locationName ?? locationId;
    if (rec && rec.name) setLocationName(rec.name);
    const apply = (la:number, lo:number, src?:string) => {
      setLat(String(Number(la).toFixed(5)));
      setLng(String(Number(lo).toFixed(5)));
      if (src) setCoordSource(src);
      console.log("[Location autofill]", displayName, src, la, lo);
    };
    if (rec && rec.latitude != null && rec.longitude != null) { apply(Number(rec.latitude), Number(rec.longitude), "location defaults"); return; }
    if (!island || !displayName) return;
    fetchEarliestCoords(island, displayName).then((res)=>{ if(res){ apply(res.lat, res.lon, "earliest sighting"); } }).catch(()=>{});
  },[locationId, locList, island]);

  // Submit (user mode)
  const handleSubmit = async () => {
    if (!canSubmit) return;

    const selectedLocation =
      (locList.find(l => l.id === locationId) || locList.find(l => l.name === locationId)) ?? null;

    const sitelocationValue =
      String(locationName || selectedLocation?.name || locationId || "").trim() || null;

    const payload = {
      date: dateUnknown ? null : date,
      startTime,
      stopTime,
      photographer: photographerUnknown ? "Unknown" : photographer,
      email,
      phone,
      island,
      sitelocation: locationUnknown ? "Unknown" : sitelocationValue,
      locationId,
      locationName: locationUnknown ? "Unknown" : sitelocationValue,
      latitude: lat || null,
      longitude: lng || null,
      mantas
    };

    try {
      await supabase.from("sighting_submissions").insert({
        email: email || null,
        sighting_date: dateUnknown ? null : date || null,
        manta_count: mantas.length,
        photo_count: totalPhotos,
        payload,
        status: "pending"
      });
    } catch {}

    setSuccessMessage(`Your sighting has been submitted for review with ${mantas.length} mantas and ${totalPhotos} photos. Thank you!`);
    setSuccessOpen(true);
  };

  // Save handlers for Add/Edit manta
  const onAddSave = async (m: MantaDraft) => {
    console.log("[AddSighting][onAddSave] received manta", m);

    setAddOpen(false);
    const incomingId = (m as any).id ? String((m as any).id) : "";
    const savedManta = { ...(m as any), id: incomingId || uuid() } as MantaDraft;
    setMantas(prev => {
      const exists = savedManta.id && prev.some(p => String(p.id) === String(savedManta.id));
      const next = exists
        ? prev.map(p => String(p.id) === String(savedManta.id) ? savedManta : p)
        : [...prev, savedManta];
      console.log("[AddSighting][onAddSave] next mantas", next);
      return next;
    });
    setMorePhotosManta(savedManta);

  };
  const onEditSave = (m:MantaDraft) => {
    setMantas(prev=>{
      const i=prev.findIndex(x=>x.id===m.id);
      if(i>=0){
        const keep:any = prev[i] as any;
        const merged:any = { ...(m as any) };
        if (keep.matchedCatalogId != null && merged.matchedCatalogId == null) merged.matchedCatalogId = keep.matchedCatalogId;
        if (typeof keep.noMatch === "boolean" && typeof merged.noMatch !== "boolean") merged.noMatch = keep.noMatch;
        const c=[...prev]; c[i]=merged as any; return c;
      }
      return [...prev, m];
    });
    setEditingManta(null);
  };

  async function handleSaveReview() {
    if (!reviewId) { window.alert("Not in review mode"); return; }
    const payload:any = {
      date, startTime, stopTime,
      photographer, email, phone,
      island, locationId, locationName,
      latitude: lat, longitude: lng,
      mantas,
      notes
    };
    try {
      await saveReviewServer(reviewId, payload);
      window.alert("Saved ✓");
    } catch (e) {
      console.error("[SaveReview] failed", e);
      window.alert("Save failed");
    }
  }


  // Review actions
  async function handleCommitReview() {
    if (!reviewId) return;
    if (!window.confirm("Commit this submission to final tables?")) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? null;

      const envEdgeBase = (import.meta as any)?.env?.VITE_SUPABASE_EDGE_URL;
      const envSupabaseUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL;
      const clientSupabaseUrl =
        (supabase as any)?.supabaseUrl ||
        (supabase as any)?.url ||
        null;

      const resolvedSupabaseUrl = envSupabaseUrl || clientSupabaseUrl;
      const edgeBase =
        envEdgeBase ||
        (resolvedSupabaseUrl ? `${String(resolvedSupabaseUrl).replace(/\/$/, "")}/functions/v1` : null);

      const anonKey =
        (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY ||
        (supabase as any)?.supabaseKey ||
        null;

      if (!edgeBase) {
        throw new Error("Missing Supabase Edge Function base URL");
      }

      const res = await fetch(`${edgeBase}/commit-sighting-submission`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(anonKey ? { apikey: anonKey } : {}),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ sub_id: reviewId }),
      });

      let body: any = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      console.log("[CommitReview] raw function response", {
        status: res.status,
        ok: res.ok,
        body,
      });

      if (!res.ok) {
        throw new Error(
          body?.error ||
          body?.message ||
          `Commit function failed with status ${res.status}`
        );
      }

      if (body?.error) {
        throw new Error(body.error);
      }

      window.alert("Committed.");
      navigate(returnPath);
    } catch (e:any) {
      console.error("[CommitReview] failed", e);
      window.alert(
        "Commit failed. No final records were written, and this submission was not marked committed. A real server-side commit function must be installed before this action can succeed."
      );
    }
  }
  async function handleRejectReview() {
    if (!reviewId) return;
    if (!window.confirm("Are you sure you want to reject this submission?")) return;
    await supabase.from("sighting_submissions")
      .update({ status: "rejected", rejected_at: new Date().toISOString() })
      .eq("id", reviewId);
    window.alert("Submission rejected.");
    navigate(returnPath);
  }

  // MantasList hooks
  const onEdit = (m: MantaDraft) => setEditingManta(m);
  const onRemove = (id: string) => {
    setMantas(prev => prev.filter(x => String(x.id) !== String(id)));
    setSelectedMantaIds(prev => prev.filter(selectedId => selectedId !== id));
  };
  const toggleMantaSelected = (id: string, checked: boolean) => {
    setSelectedMantaIds(prev => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter(selectedId => selectedId !== id);
    });
  };
  const toggleAllMantasSelected = (checked: boolean) => {
    setSelectedMantaIds(checked ? mantas.map(m => String(m.id)) : []);
  };
  const deleteSelectedMantas = () => {
    if (selectedMantaIds.length === 0) return;
    const selected = new Set(selectedMantaIds);
    setMantas(prev => prev.filter(m => !selected.has(String(m.id))));
    setSelectedMantaIds([]);
  };
  const openMatch = (m: MantaDraft, ventralUrl?: string) => {
    setPageMatchMeta({ name: m.name, gender: (m as any).gender ?? null, ageClass: (m as any).ageClass ?? null, meanSize: (m as any).size ?? null });
    setPageMatchUrl(ventralUrl || "");
    setPageMatchFor(String(m.id));
    setPageMatchOpen(true);
  };

  async function saveTableEditedPhoto(target: { mantaId: string; photo: Uploaded }, blob: Blob) {
    const photo = target.photo;
    const extless = photo.path.replace(/\.[^.]+$/, "");
    const editedPath = `${extless}-edited-${Date.now()}.jpg`;

    const { error } = await supabase.storage.from("temp-images").upload(editedPath, blob, {
      cacheControl: "3600",
      upsert: true,
      contentType: "image/jpeg",
    });

    if (error) {
      throw new Error(error.message || "Could not upload edited photo.");
    }

    const { data } = supabase.storage.from("temp-images").getPublicUrl(editedPath);
    const previewUrl = URL.createObjectURL(blob);

    setMantas((prev) =>
      prev.map((m) => {
        if (String(m.id) !== target.mantaId) return m;
        return {
          ...m,
          photos: m.photos.map((p) => {
            if (p.id !== photo.id) return p;
            if (p.previewUrl && p.previewUrl.startsWith("blob:")) {
              try { URL.revokeObjectURL(p.previewUrl); } catch {}
            }
            return {
              ...p,
              name: `${p.name.replace(/\.[^.]+$/, "")}-edited.jpg`,
              path: editedPath,
              url: data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : previewUrl,
              previewUrl,
              isHeicLike: false,
              edited: true,
            };
          }),
        };
      })
    );
  }

  async function replaceTablePhoto(target: { mantaId: string; photo: Uploaded }, file: File) {
    const lower = file.name.toLowerCase();
    const isHeicLike = file.type === "image/heic" || file.type === "image/heif" || lower.endsWith(".heic") || lower.endsWith(".heif");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const replacementPath = `${formSightingId}/${target.mantaId}/${target.photo.id}-replacement-${Date.now()}.${ext}`;
    const previewUrl = URL.createObjectURL(file);

    const { error } = await supabase.storage.from("temp-images").upload(replacementPath, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || undefined,
    });

    if (error) {
      try { URL.revokeObjectURL(previewUrl); } catch {}
      throw new Error(error.message || "Could not replace photo.");
    }

    const { data } = supabase.storage.from("temp-images").getPublicUrl(replacementPath);

    setMantas((prev) =>
      prev.map((m) => {
        if (String(m.id) !== target.mantaId) return m;
        return {
          ...m,
          photos: m.photos.map((p) => {
            if (p.id !== target.photo.id) return p;
            if (p.previewUrl && p.previewUrl.startsWith("blob:")) {
              try { URL.revokeObjectURL(p.previewUrl); } catch {}
            }
            return {
              ...p,
              name: file.name,
              path: replacementPath,
              url: data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : previewUrl,
              previewUrl,
              isHeicLike,
              edited: false,
              measure: undefined,
            };
          }),
        };
      })
    );
  }

  async function onReplaceTablePhotoBrowse(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    e.currentTarget.value = "";
    if (!file || !replacingPhoto) return;
    try {
      await replaceTablePhoto(replacingPhoto, file);
    } catch (err: any) {
      window.alert(err?.message || "Could not replace photo.");
    } finally {
      setReplacingPhoto(null);
    }
  }

  // UI
  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-3 text-sm">
        <Link to="/dashboard" className="text-blue-700 underline">
          Dashboard
        </Link>
        <span className="text-slate-600"> / Add Sighting</span>
      </div>

{/* __UNIFIED_MANTA_MODAL_MOUNT__ */}
<UnifiedMantaModal
  open={addOpen}
  onClose={()=>setAddOpen(false)}
  sightingId={formSightingId}
  defaultName={mantaTempName(mantas.length)}
  ordinalLabel={mantaOrdinalLabel(mantas.length)}
  canMeasure={canMeasureMantas}
  needsExifPrompt={!dateValid || !String(startTime || "").trim() || !locationValid}
  onApplyExifMetadata={applyExifMetadata}
  onSave={onAddSave}
/>
<UnifiedMantaModal
  open={!!editingManta}
  onClose={()=>setEditingManta(null)}
  sightingId={formSightingId}
  existingManta={editingManta || undefined}
  ordinalLabel={editingManta ? `${editingManta.name || "Manta"} Manta` : "Manta"}
  canMeasure={canMeasureMantas}
  needsExifPrompt={!dateValid || !String(startTime || "").trim() || !locationValid}
  onApplyExifMetadata={applyExifMetadata}
  onSave={onEditSave}
/>


{isReview && (
  <div className="px-4 sm:px-8 lg:px-16 py-3 text-sm" data-clean-id="review-crumb">
    <a href="/admin" className="text-sky-700 hover:underline">Admin</a>
    <span className="mx-1 text-slate-400">/</span>
    <a href={returnPath} className="text-sky-700 hover:underline">Review</a>
  </div>
)}

      {/* Hero */}
      <div className="bg-gradient-to-r from-sky-600 to-blue-700 py-5 text-white text-center">
        <h1 className="text-2xl font-semibold">Add Manta Sighting</h1>
        <div className="text-xs opacity-90 mt-1">sighting: {formSightingId.slice(0,8)}</div>
      </div>

      {/* Sighting Details */}
      <div className="max-w-7xl mx-auto px-4 py-4 space-y-3">
        <Card className="rounded-md">
          <CardContent className="grid items-center gap-3 p-3 md:grid-cols-[150px_1fr_1fr_1fr]">
            <h2 className="text-base font-semibold text-slate-900">Sighting Details</h2>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Date <span className="text-red-600">*</span></label>
              <input type="date" value={date} onChange={(e)=>setDate(e.target.value)} disabled={dateUnknown} className="h-9 w-full border rounded px-3 text-sm disabled:bg-slate-100" />
              <label className="mt-1 flex items-center gap-1 text-xs text-slate-600">
                <input type="checkbox" checked={dateUnknown} onChange={(e)=>setDateUnknown(e.target.checked)} />
                Unknown
              </label>
            </div>
            <select value={startTime} onChange={(e)=>setStartTime(e.target.value)} className="h-9 border rounded px-3 text-sm">
              <option value="">Start Time</option>
              {TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <select value={stopTime} onChange={(e)=>setStopTime(e.target.value)} className="h-9 border rounded px-3 text-sm">
              <option value="">Stop Time</option>
              {TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </CardContent>
        </Card>

        {/* Photographer & Contact */}
        <Card className="rounded-md">
          <CardContent className="grid items-center gap-3 p-3 md:grid-cols-[150px_1fr_1fr_1fr]">
            <h2 className="text-base font-semibold text-slate-900">Photographer & Contact</h2>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Photographer <span className="text-red-600">*</span></label>
              <input placeholder="Photographer" value={photographer} onChange={(e)=>setPhotographer(e.target.value)} disabled={photographerUnknown} className="h-9 w-full border rounded px-3 text-sm disabled:bg-slate-100" />
              <label className="mt-1 flex items-center gap-1 text-xs text-slate-600">
                <input type="checkbox" checked={photographerUnknown} onChange={(e)=>setPhotographerUnknown(e.target.checked)} />
                Unknown
              </label>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Email <span className="text-red-600">*</span></label>
              <input id="contact-email-field" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} className={"h-9 w-full border rounded px-3 text-sm " + (email && !emailValid ? "border-red-500" : "")} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Phone</label>
              <input placeholder="Phone" value={phone} onChange={(e)=>setPhone(e.target.value)} className="h-9 w-full border rounded px-3 text-sm" />
            </div>
          </CardContent>
        </Card>

        {/* Location */}
        <Card className="rounded-md">
          <CardContent className="space-y-2 p-3">
            <div className="grid items-start gap-3 md:grid-cols-[150px_1fr_1fr_1fr_1fr_auto]">
              <h2 className="text-base font-semibold text-slate-900">Location <span className="text-red-600">*</span></h2>
              <div>
                <select value={island} onChange={(e)=>setIsland(e.target.value)} disabled={locationUnknown} className="h-9 w-full border rounded px-3 text-sm disabled:bg-slate-100">
                  <option value="">{islandsLoading ? 'Loading islands...' : 'Select island'}</option>
                  {islands.map(isl => (<option key={isl} value={isl}>{isl}</option>))}
                </select>
                <label className="mt-1 flex items-center gap-1 text-xs text-slate-600">
                  <input type="checkbox" checked={locationUnknown} onChange={(e)=>setLocationUnknown(e.target.checked)} />
                  Unknown
                </label>
              </div>
              <div>
                <select
                  value={locationId}
                  onChange={(e)=>setLocationId(e.target.value)}
                  disabled={locationUnknown}
                  className="h-9 w-full border rounded px-3 text-sm disabled:bg-slate-100"
                >
                  <option value="">{island ? 'Select location' : 'Select island first'}</option>
                  {locList.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                {!locationUnknown && !addingLoc ? (
                  <button
                    type="button"
                    data-clean-id="add-location-link"
                    className="mt-1 text-[11px] text-sky-700 underline"
                    onClick={()=>setAddingLoc(true)}
                  >
                    + Add new location
                  </button>
                ) : !locationUnknown ? (
                  <button
                    type="button"
                    className="mt-1 text-[11px] text-slate-600 underline"
                    onClick={()=>setAddingLoc(false)}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
              <input
                placeholder="Latitude"
                value={lat}
                onChange={(e)=>setLat(e.target.value)}
                disabled={locationUnknown}
                className="h-9 border rounded px-3 text-sm disabled:bg-slate-100"
              />
              <input
                placeholder="Longitude"
                value={lng}
                onChange={(e)=>setLng(e.target.value)}
                disabled={locationUnknown}
                className="h-9 border rounded px-3 text-sm disabled:bg-slate-100"
              />
              <Button type="button" variant="outline" className="h-9 whitespace-nowrap" onClick={()=>setMapOpen(true)} disabled={locationUnknown}>
                Use Map
              </Button>
            </div>

            {addingLoc && !locationUnknown && (
              <div className="grid gap-2 md:grid-cols-[150px_1fr_auto]">
                <div />
                <input
                  placeholder="New location name"
                  value={newLoc}
                  onChange={(e)=>setNewLoc(e.target.value)}
                  className="h-9 border rounded px-3 text-sm"
                />
                <button
                  type="button"
                  className="h-9 px-3 border rounded text-sm"
                  onClick={async () => {
                    const name = newLoc.trim();
                    if (!name || !island) return;

                    try {
                      const latitudeValue = lat ? Number(lat) : null;
                      const longitudeValue = lng ? Number(lng) : null;

                      const { error } = await supabase
                        .from("location_overrides")
                        .insert({
                          island,
                          region: null,
                          sitelocation: name,
                          lat_found: Number.isFinite(latitudeValue) ? latitudeValue : null,
                          lon_found: Number.isFinite(longitudeValue) ? longitudeValue : null,
                          lat_offshore: null,
                          lon_offshore: null,
                          geocoder_note: "user_added_from_add_sighting",
                        });

                      if (error) {
                        const duplicate =
                          error.code === "23505" ||
                          String(error.message || "").toLowerCase().includes("duplicate");

                        if (!duplicate) {
                          console.error("[AddLocation] insert error", error);
                          window.alert("Failed to save location");
                          return;
                        }
                      }

                      setLocList((prev) => {
                        const exists = prev.some(
                          (loc) =>
                            String(loc.name).trim().toLowerCase() === name.toLowerCase() &&
                            String(loc.island || "").trim().toLowerCase() === island.toLowerCase()
                        );

                        if (exists) return prev;

                        return [
                          {
                            id: name,
                            name,
                            island,
                            latitude: Number.isFinite(latitudeValue) ? latitudeValue : null,
                            longitude: Number.isFinite(longitudeValue) ? longitudeValue : null,
                          },
                          ...prev,
                        ];
                      });

                      setLocationId(name);
                      setLocationName(name);
                      setAddingLoc(false);
                      setNewLoc("");
                    } catch (e) {
                      console.error("[AddLocation] exception", e);
                      window.alert("Unexpected error saving location");
                    }
                  }}
                >
                  Use Name
                </button>
              </div>
            )}

          </CardContent>
        </Card>

        {/* Notes (placeholder) */}
        <Card className="rounded-md">
          <CardContent className="grid gap-3 p-3 md:grid-cols-[150px_1fr]">
            <h2 className="text-base font-semibold text-slate-900">Notes</h2>
            <textarea className="min-h-[58px] w-full border rounded px-3 py-2 text-sm" placeholder="Enter notes about this sighting..."  value={notes} onChange={(e)=>setNotes(e.target.value)} />
          </CardContent>
        </Card>

        {/* Mantas Added */}
        <Card className="rounded-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3">
            <CardTitle className="text-base">Mantas Added</CardTitle>
            <div className="flex items-center gap-2">
              <Button type="button" data-clean-id="add-mantas" size="sm" onClick={()=>setAddOpen(true)}>
                Add New Manta
              </Button>
              <button
                type="button"
                aria-label="Delete selected mantas"
                className="inline-flex h-9 w-9 items-center justify-center rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={deleteSelectedMantas}
                disabled={selectedMantaIds.length === 0}
                title="Delete selected mantas"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <MantasList
              mantas={mantas}
              setMantas={setMantas}
              onEdit={onEdit}
              onEditPhoto={(m, photo) => setEditingPhoto({ mantaId: String(m.id), photo })}
              onReplacePhoto={(m, photo) => {
                const ok = window.confirm(
                  "Replace this photo? Any edits and size measurements for this photo will be lost."
                );
                if (!ok) return;
                setReplacingPhoto({ mantaId: String(m.id), photo });
                replacePhotoInputRef.current?.click();
              }}
              onRemove={onRemove}
              openMatch={openMatch}
              totalPhotosAll={totalPhotosAll}
              selectedIds={selectedMantaIds}
              onToggleSelect={toggleMantaSelected}
              onToggleAll={toggleAllMantasSelected}
            />
          </CardContent>
        </Card>

        {/* Footer buttons */}
        <div className="flex justify-center mt-6 gap-2">
          {isReview ? (
            <>
              <Button variant="destructive" onClick={handleRejectReview}>Reject</Button>
            <Button variant="outline" onClick={() => navigate(returnPath)}>Cancel</Button>
            <Button variant="secondary" onClick={handleSaveReview}>Save Changes</Button>
                        <Button onClick={handleCommitReview}>Commit Review</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => navigate("/dashboard")}>Cancel</Button>
              <Button data-clean-id="submit-sighting" onClick={handleSubmit} disabled={!canSubmit}>
                Submit Sighting
              </Button>
              <div className="flex items-center text-xs text-slate-500">
                <span className="text-red-600">*</span>
                <span className="ml-1">Required fields</span>
              </div>
            </>
          )}
        </div>
        <div id="probe-add-sighting-v2" className="mx-auto mt-2 max-w-5xl px-4 text-[10px] text-muted-foreground">probe:add-sighting-v2</div>
      </div>

      {/* Match modal */}
      <MatchModal
        open={pageMatchOpen}
        onClose={() => setPageMatchOpen(false)}
        tempUrl={pageMatchUrl}
        aMeta={pageMatchMeta}
        onChoose={(catalogId) => {
          if (!pageMatchFor) { setPageMatchOpen(false); return; }
          setMantas(prev =>
            prev.map(mm =>
              String(mm.id) === String(pageMatchFor)
                ? ({ ...mm, matchedCatalogId: catalogId, noMatch: false } as any)
                : mm
            )
          );
          setPageMatchOpen(false);
        }}
        onNoMatch={() => {
          if (!pageMatchFor) { setPageMatchOpen(false); return; }
          setMantas(prev =>
            prev.map(mm =>
              String(mm.id) === String(pageMatchFor)
                ? ({ ...mm, matchedCatalogId: null, noMatch: true } as any)
                : mm
            )
          );
          setPageMatchOpen(false);
        }}
      />

      {editingPhoto ? (
        <PhotoEditModal
          open={true}
          src={resolvePhotoUrl(editingPhoto.photo)}
          fileName={editingPhoto.photo.name}
          onClose={() => setEditingPhoto(null)}
          onSave={(blob) => saveTableEditedPhoto(editingPhoto, blob)}
        />
      ) : null}
      <input
        ref={replacePhotoInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={onReplaceTablePhotoBrowse}
      />

      {/* Map modal */}
      {mapOpen && (
        <div className="fixed inset-0 z-[300000] bg-black/40 flex items-center justify-center" onClick={()=>setMapOpen(false)}>
          <div className="bg-white w-full max-w-2xl rounded-lg border p-4 relative" onClick={(e)=>e.stopPropagation()}>
            <button aria-label="Close" className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full border" onClick={()=>setMapOpen(false)}>&times;</button>
            <h3 className="text-lg font-medium mb-3">Pick Location</h3>
            <TempSightingMap
              lat={Number.isFinite(parseFloat(lat)) ? parseFloat(lat) : undefined}
              lon={Number.isFinite(parseFloat(lng)) ? parseFloat(lng) : undefined}
              onPick={(la,lo)=>{ setLat(String(la.toFixed(5))); setLng(String(lo.toFixed(5))); setCoordSource("map pick"); }}
            />
          </div>
        </div>
      )}

      <Dialog
        open={confirmExifOpen}
        onOpenChange={(open) => {
          setConfirmExifOpen(open);
          if (!open) setExifSuggestion(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Use photo metadata?</DialogTitle>
            <DialogDescription>
              Please verify that the photo metadata looks correct before applying it to this sighting.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm">
            {exifSuggestion?.date ? <div>Date: {exifSuggestion.date}</div> : null}
            {exifSuggestion?.time ? <div>Start time: {exifSuggestion.time}</div> : null}
            {(typeof exifSuggestion?.lat === "number" && typeof exifSuggestion?.lon === "number") ? (
              <div>Coordinates: {exifSuggestion.lat}, {exifSuggestion.lon}</div>
            ) : null}
            {exifSuggestion?.suggestedIsland ? <div>Suggested island: {exifSuggestion.suggestedIsland}</div> : null}
            {exifSuggestion?.suggestedLocation ? <div>Suggested location: {exifSuggestion.suggestedLocation}</div> : null}
            {!exifSuggestion?.date && !exifSuggestion?.time && typeof exifSuggestion?.lat !== "number" && (
              <div className="text-slate-500">No usable date, time, or location metadata was found.</div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmExifOpen(false);
                setExifSuggestion(null);
              }}
            >
              No, I’ll enter manually
            </Button>
            <Button
              onClick={() => {
                console.log("[AddSighting][EXIF] YES button clicked", exifSuggestion);
                if (!exifSuggestion) return;
                applyExifMetadata(exifSuggestion);
                setConfirmExifOpen(false);
                setExifSuggestion(null);
              }}
            >
              Yes, use metadata
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={successOpen}
        onOpenChange={(v) => {
          setSuccessOpen(v);
          if (!v) navigate("/dashboard");
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sighting submitted</DialogTitle>
            <DialogDescription>{successMessage}</DialogDescription>
          </DialogHeader>

          <div className="flex justify-end">
            <Button
              onClick={() => {
                setSuccessOpen(false);
                navigate("/dashboard");
              }}
            >
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!morePhotosManta}
        onOpenChange={(open) => {
          if (!open) setMorePhotosManta(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>More photos for this manta?</DialogTitle>
            <DialogDescription>
              Do you have any more photos of Manta {morePhotosManta?.name || "this manta"} to add?
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const mantaName = morePhotosManta?.name || "this manta";
                setMorePhotosManta(null);
                setMantaAddedMessage(
                  `Manta ${mantaName} has been added. If you have additional mantas in your encounter, add them now.`
                );
              }}
            >
              No
            </Button>
            <Button
              onClick={() => {
                if (!morePhotosManta) return;
                setEditingManta(morePhotosManta);
                setMorePhotosManta(null);
              }}
            >
              Yes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!mantaAddedMessage}
        onOpenChange={(open) => {
          if (!open) setMantaAddedMessage("");
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manta added</DialogTitle>
            <DialogDescription>{mantaAddedMessage}</DialogDescription>
          </DialogHeader>

          <div className="flex justify-end">
            <Button onClick={() => setMantaAddedMessage("")}>OK</Button>
          </div>
        </DialogContent>
      </Dialog>

    </Layout>
  );
}
