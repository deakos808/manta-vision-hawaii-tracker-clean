import React, { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import MatchModal from "@/components/mantas/MatchModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import UnifiedMantaModal, { type MantaDraft } from "@/components/mantas/UnifiedMantaModal";
import MantasList from "@/components/mantas/MantasList";
import { supabase } from "@/lib/supabase";
import TempSightingMap from "@/components/map/TempSightingMap";
import { saveReviewServer } from "@/utils/reviewSave";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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

export default function AddSightingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

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
  const [addOpen, setAddOpen] = useState(false);
  const [editingManta, setEditingManta] = useState<MantaDraft|null>(null);

  // Sighting details
  const [date, setDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [stopTime, setStopTime] = useState<string>("");

  // Contact
  const [photographer, setPhotographer] = useState("");
  const [email, setEmail] = useState("");
  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const dateValid  = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "").trim());
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
  const [addingLoc, setAddingLoc] = useState(false);
  const [newLoc, setNewLoc] = useState("");

  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");
  const [coordSource, setCoordSource] = useState<string>("");

  const [confirmExifOpen, setConfirmExifOpen] = useState(false);
  const [exifSuggestion, setExifSuggestion] = useState<ExifSuggestion | null>(null);

  const [successOpen, setSuccessOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const [mapOpen, setMapOpen] = useState(false);
  const formSightingId = useMemo(()=>uuid(),[]);
  const totalPhotosAll = useMemo(() => (mantas ?? []).reduce((a,m)=> a + (Array.isArray((m as any).photos) ? (m as any).photos.length : 0), 0), [mantas]);

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

    if (meta.date && !String(date || "").trim()) setDate(meta.date);
    if (meta.time && !String(startTime || "").trim()) setStartTime(meta.time);
    if (typeof meta.lat === "number" && !String(lat || "").trim()) setLat(String(Number(meta.lat).toFixed(5)));
    if (typeof meta.lon === "number" && !String(lng || "").trim()) setLng(String(Number(meta.lon).toFixed(5)));

    if (meta.suggestedIsland && !String(island || "").trim()) setIsland(meta.suggestedIsland);
    if (meta.suggestedLocation && !String(locationId || "").trim()) {
      setLocationId(meta.suggestedLocation);
      setLocationName(meta.suggestedLocation);
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
    if (!dateValid) return;
    if (!emailValid) return;

    const payload = {
      date, startTime, stopTime, photographer, email, phone,
      island, locationId, locationName,
      latitude: lat, longitude: lng,
      mantas
    };

    try {
      await supabase.from("sighting_submissions").insert({
        email: email || null,
        sighting_date: date || null,
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
    setMantas(prev => {
      const incomingId = (m as any).id ? String((m as any).id) : "";
      const exists = incomingId && prev.some(p => String(p.id) === incomingId);
      const id = exists || !incomingId ? uuid() : incomingId;
      const next = [...prev, { ...(m as any), id }];
      console.log("[AddSighting][onAddSave] next mantas", next);
      return next;
    });

    const surveyHasDate = !!String(date || "").trim();
    const surveyHasLocation = !!String(locationId || locationName || "").trim();
    const exif = (m as any)?.firstExifMeta ?? null;

    console.log("[AddSighting][onAddSave] survey state", {
      surveyHasDate,
      surveyHasLocation,
      date,
      locationId,
      locationName,
      exif,
    });

    if ((!surveyHasDate || !surveyHasLocation) && exif) {
      console.log("[AddSighting][onAddSave] calling prepareExifSuggestion", exif);

      const suggestion = await prepareExifSuggestion(exif);

      console.log("[AddSighting][onAddSave] prepareExifSuggestion result", suggestion);

      if (suggestion) {
        setPendingExif(suggestion.meta);
        setSuggestedExifIsland(suggestion.bestIsland ?? null);
        setSuggestedExifLocation(suggestion.bestLocation ?? null);
        setConfirmExifOpen(true);
      }
    } else {
      console.log("[AddSighting][onAddSave] not prompting", {
        missingSurveyField: !surveyHasDate || !surveyHasLocation,
        hasExif: !!exif,
      });
    }
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
      const { error } = await supabase.rpc("commit_sighting_submission", { sub_id: reviewId });
      if (error) { throw error; }
      window.alert("Committed.");
    } catch (e) {
      console.warn("[CommitReview] RPC not available or failed; falling back to status update.", (e && (e.message||e)) || e);
      await supabase.from("sighting_submissions")
        .update({ status: "committed", committed_at: new Date().toISOString() })
        .eq("id", reviewId);
      window.alert("Marked committed.");
    }
    navigate(returnPath);
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
  const onRemove = (id: string) => setMantas(prev => prev.filter(x => String(x.id) !== String(id)));
  const openMatch = (m: MantaDraft, ventralUrl?: string) => {
    setPageMatchMeta({ name: m.name, gender: (m as any).gender ?? null, ageClass: (m as any).ageClass ?? null, meanSize: (m as any).size ?? null });
    setPageMatchUrl(ventralUrl || "");
    setPageMatchFor(String(m.id));
    setPageMatchOpen(true);
  };

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
  onSave={onAddSave}
/>
<UnifiedMantaModal
  open={!!editingManta}
  onClose={()=>setEditingManta(null)}
  sightingId={formSightingId}
  existingManta={editingManta || undefined}
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
      <div className="bg-gradient-to-r from-sky-600 to-blue-700 py-8 text-white text-center">
        <h1 className="text-3xl font-semibold">Add Manta Sighting</h1>
        <div className="text-xs opacity-90 mt-1">sighting: {formSightingId.slice(0,8)}</div>
      </div>

      {/* Sighting Details */}
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader><CardTitle>Sighting Details</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-3">
            <input type="date" value={date} onChange={(e)=>setDate(e.target.value)} className="border rounded px-3 py-2" />
            <select value={startTime} onChange={(e)=>setStartTime(e.target.value)} className="border rounded px-3 py-2">
              <option value="">Start Time</option>
              {TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <select value={stopTime} onChange={(e)=>setStopTime(e.target.value)} className="border rounded px-3 py-2">
              <option value="">Stop Time</option>
              {TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </CardContent>
        </Card>

        {/* Photographer & Contact */}
        <Card>
          <CardHeader><CardTitle>Photographer & Contact</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-3">
            <input placeholder="Photographer" value={photographer} onChange={(e)=>setPhotographer(e.target.value)} className="border rounded px-3 py-2" />
            <input id="contact-email-field" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} className={"border rounded px-3 py-2 " + (email && !emailValid ? "border-red-500" : "")} />
            <input placeholder="Phone" value={phone} onChange={(e)=>setPhone(e.target.value)} className="border rounded px-3 py-2" />
            {!emailValid && <div className="text-xs text-red-500 md:col-span-3">An email address is required.</div>}
          </CardContent>
        </Card>

        {/* Location */}
        <Card>
          <CardHeader><CardTitle>Location</CardTitle></CardHeader>
          <CardContent className="space-y-3">
  <div className="grid md:grid-cols-2 gap-3">
    {/* Island select */}
    <select value={island} onChange={(e)=>setIsland(e.target.value)} className="border rounded px-3 py-2">
  <option value="">{islandsLoading ? 'Loading islands…' : 'Select island'}</option>
  {islands.map(isl => (<option key={isl} value={isl}>{isl}</option>))}
</select>

    {/* Location select + small link underneath */}
    <div className="space-y-1">
  <select
    value={locationId}
    onChange={(e)=>setLocationId(e.target.value)}
    className="border rounded px-3 py-2"
  >
    <option value="">{island ? 'Select location' : 'Select island first'}</option>
    {locList.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
  </select>
  {!addingLoc ? (
    <button
      type="button"
      data-clean-id="add-location-link"
      className="block mt-1 text-sky-700 text-xs underline"
      onClick={()=>setAddingLoc(true)}
    >
      + Add new location
    </button>
  ) : (
    <button
      type="button"
      className="block mt-1 text-slate-600 text-xs underline"
      onClick={()=>setAddingLoc(false)}
    >
      Cancel
    </button>
  )}
</div>
  </div>

  {addingLoc && (
    <div className="grid md:grid-cols-3 gap-2">
      <input
        placeholder="New location name"
        value={newLoc}
        onChange={(e)=>setNewLoc(e.target.value)}
        className="border rounded px-3 py-2 md:col-span-2"
      />
      <button
        type="button"
        className="px-2 py-1 border rounded"
        onClick={()=>{
          const name = newLoc.trim();
          if (!name) return;
          setLocationId(name);
          setLocationName(name);
          setAddingLoc(false);
        }}
      >
        Use this name
      </button>
    </div>
  )}

  <div className="grid md:grid-cols-2 gap-3">
    <input
      placeholder="Latitude"
      value={lat}
      onChange={(e)=>setLat(e.target.value)}
      className="border rounded px-3 py-2"
    />
    <input
      placeholder="Longitude"
      value={lng}
      onChange={(e)=>setLng(e.target.value)}
      className="border rounded px-3 py-2"
    />
  </div>

  <div className="text-xs text-slate-500">coords source: {coordSource || "—"}</div>
  <button
    type="button"
    className="px-3 py-2 border rounded"
    onClick={()=>setMapOpen(true)}
  >
    Use Map for Location
  </button>
</CardContent>
        </Card>

        {/* Notes (placeholder) */}
        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent>
            <textarea className="w-full min-h-[120px] border rounded px-3 py-2" placeholder="Enter notes about this sighting..."  value={notes} onChange={(e)=>setNotes(e.target.value)} />
          </CardContent>
        </Card>

        {/* Mantas Added */}
        <Card>
          <CardHeader><CardTitle>Mantas Added</CardTitle></CardHeader>
          <CardContent>
            <MantasList
              mantas={mantas}
              setMantas={setMantas}
              onEdit={onEdit}
              onRemove={onRemove}
              openMatch={openMatch}
              totalPhotosAll={totalPhotosAll}
            />
            <div className="mt-3">
              <Button type="button" data-clean-id="add-mantas" onClick={()=>setAddOpen(true)}>Add Mantas</Button>
            </div>
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
              <Button data-clean-id="submit-sighting" onClick={handleSubmit} disabled={!emailValid || !dateValid}>
                Submit Sighting
              </Button>
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
              This photo includes metadata that may help populate sighting date and location.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm">
            {exifSuggestion?.date ? <div>Date: {exifSuggestion.date}</div> : null}
            {(typeof exifSuggestion?.lat === "number" && typeof exifSuggestion?.lon === "number") ? (
              <div>Coordinates: {exifSuggestion.lat}, {exifSuggestion.lon}</div>
            ) : null}
            {exifSuggestion?.suggestedIsland ? <div>Suggested island: {exifSuggestion.suggestedIsland}</div> : null}
            {exifSuggestion?.suggestedLocation ? <div>Suggested location: {exifSuggestion.suggestedLocation}</div> : null}
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

    </Layout>
  );
}
