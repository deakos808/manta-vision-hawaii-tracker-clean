import { notifySubmission } from "@/features/sightings/submissionNotification";
import { getSubmissionIssues, getApprovalIssues, approvalFailureMessage, TIME_ORDER_MESSAGE, MULTI_DATE_REVIEW_MESSAGE, type SubmissionField } from "@/features/sightings/submissionValidation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Layout from "@/components/layout/Layout";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import MatchModal from "@/components/mantas/MatchModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import UnifiedMantaModal, { type MantaDraft } from "@/components/mantas/UnifiedMantaModal";
import { photoTimeBounds, photoTimeUpdate, readSurveyType, type SurveyType } from "@/features/sightings/photoTimes";
import { readSightingMethods } from "@/features/sightings/sightingMethods";
import MantasList from "@/components/mantas/MantasList";
import { supabase } from "@/lib/supabase";
import LocationPickerModal from "@/components/map/LocationPickerModal";
import { initialLocationPoint, formatLocationPoint, locationPoint } from "@/components/map/locationSelection";
import { saveReviewServer } from "@/utils/reviewSave";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useUserAccess } from "@/hooks/useUserAccess";
import { hasOrganicBiopsies, validateOrganicBiopsy } from "@/features/biopsies/organicBiopsy";

function uuid(){ try { return (crypto as any).randomUUID(); } catch { return Math.random().toString(36).slice(2); } }
const METHOD_OPTIONS = [
  ["pairedLaser", "Paired-laser photogrammetry", "Paired laser"],
  ["biopsySampling", "Biopsy sampling", "Biopsy"],
  ["tagDeployment", "Tag deployment", "Tag deployment"],
] as const;

function mantaLabel(sequence: number): string {
  let label = "";
  for (let n = sequence + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    label = String.fromCharCode(65 + (n - 1) % 26) + label;
  }
  return label;
}

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
  const access = useUserAccess();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const reviewId = (location.state as { reviewId?: string } | null)?.reviewId
    || searchParams.get("review") || searchParams.get("reviewId") || null;
  const isReview = !!reviewId;
  const canReview = !access.loading && access.isActive === true && access.role === "admin";
  const [loadedReviewId, setLoadedReviewId] = useState<string | null>(null);
  const [reviewLoadError, setReviewLoadError] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);

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

  const [methods, setMethods] = useState(() => readSightingMethods());

  // Mantas
  const [mantas, setMantas] = useState<MantaDraft[]>([]);
  // Advance only on add, never derive identity from the remaining array positions.
  const [nextMantaSequence, setNextMantaSequence] = useState(0);
  const totalPhotos = useMemo(() => useTotalPhotos(mantas as any), [mantas]);
  const [addOpen, setAddOpen] = useState(() => {
    // Decide before review hydration so existing submissions never auto-open.
    const windowParams = new URLSearchParams(window.location.search);
    return !((location.state as { reviewId?: string } | null)?.reviewId
      || searchParams.get("review") || searchParams.get("reviewId")
      || windowParams.get("review") || windowParams.get("reviewId"));
  });
  // addOpen's initial value already excludes every supported review entry route.
  const [methodsConfirmed, setMethodsConfirmed] = useState(() => !addOpen);
  const [editMethodsOpen, setEditMethodsOpen] = useState(false);
  const methodsDialogOpen = editMethodsOpen || (addOpen && !methodsConfirmed && !isReview);
  const [editingManta, setEditingManta] = useState<MantaDraft|null>(null);

  // Sighting details
  const [date, setDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [stopTime, setStopTime] = useState<string>("");
  const [standardizeSurvey, setStandardizeSurvey] = useState<SurveyType>(isReview ? null : "No");
  const [timesManuallyEdited, setTimesManuallyEdited] = useState(false);
  const [timeChoiceMade, setTimeChoiceMade] = useState(false);
  const [reviewedPhotoDates, setReviewedPhotoDates] = useState("");
  const photoBounds = useMemo(() => photoTimeBounds(mantas), [mantas]);
  const multiDateKey = photoBounds?.multipleDates ? `${photoBounds.first}/${photoBounds.last}` : "";
  const needsTimeReview = !!multiDateKey && reviewedPhotoDates !== multiDateKey;
  const retainEffort = () => { setTimesManuallyEdited(true); setTimeChoiceMade(true); };
  const editTime = (field: "date" | "start" | "stop", value: string) => {
    setTimesManuallyEdited(true);
    setReviewedPhotoDates("");
    if (field === "date") setDate(value);
    else if (field === "start") setStartTime(value);
    else setStopTime(value);
  };
  useEffect(() => {
    const update = photoTimeUpdate(standardizeSurvey, timesManuallyEdited, photoBounds);
    if (update) { setDate(update.date); setStartTime(update.start); setStopTime(update.stop); }
  }, [standardizeSurvey, timesManuallyEdited, photoBounds]);


  // Contact
  const [photographer, setPhotographer] = useState("");
  const [email, setEmail] = useState("");
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
  const [locationUnknown, setLocationUnknown] = useState(false);
  const submissionIssues = getSubmissionIssues({ date, email, startTime, stopTime, standardizeSurvey, needsTimeReview, locationUnknown, locationId, locationName, latitude: lat, longitude: lng });
  const approvalIssues = getApprovalIssues({ standardizeSurvey, startTime, stopTime, mantas });
  const readinessMessages = isReview ? approvalIssues : submissionIssues.map(issue => issue.message);
  const emailValid = !submissionIssues.some(issue => issue.field === "email");
  const showFieldIssue = (field: SubmissionField) => (!isReview || field === "startTime" || field === "stopTime")
    && submissionIssues.some(issue => issue.field === field);
  const preserveLocationCoordinates = useRef(isReview);
  const [coordSource, setCoordSource] = useState<string>("");
  const [savedMapPoint, setSavedMapPoint] = useState<{ lat: string; lng: string } | null>(null);
  useEffect(() => {
    setSavedMapPoint((saved) => saved && (saved.lat !== lat || saved.lng !== lng || coordSource !== "map picker") ? null : saved);
  }, [lat, lng, coordSource]);


  const [confirmExifOpen, setConfirmExifOpen] = useState(false);
  const [exifSuggestion, setExifSuggestion] = useState<ExifSuggestion | null>(null);

  const [successOpen, setSuccessOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const [mapOpen, setMapOpen] = useState(false);
  const formSightingId = useMemo(()=>uuid(),[]);
  const totalPhotosAll = useMemo(() => (mantas ?? []).reduce((a,m)=> a + (Array.isArray((m as any).photos) ? (m as any).photos.length : 0), 0), [mantas]);

  useEffect(()=>{ console.log("[AddSighting] mounted"); }, []);

  // Fetch review payload
  useEffect(() => {
    if (!reviewId || !canReview) return;
    let cancelled = false;
    setLoadedReviewId(null);
    setReviewLoadError(false);
    (async () => {
      console.info("[AddSighting][review] fetch start", reviewId);
      try {
        const { data, error } = await supabase
          .from("sighting_submissions")
          .select("id,email,sighting_date,submitted_at,status,payload")
          .eq("id", reviewId)
          .single();
        if (cancelled) return;
        if (error || !data) { setReviewLoadError(true); return; }
        const anyd: any = data;
        setEmail(anyd.email || "");
        if (anyd.sighting_date) setDate(String(anyd.sighting_date));
        const p = (anyd.payload || {}) as any;
        preserveLocationCoordinates.current = true;
        setMethods(readSightingMethods(p.methods));
        setStandardizeSurvey(readSurveyType(p.standardize_survey));
        setTimesManuallyEdited(true); // Preserve hydrated review values until explicitly changed.
        setTimeChoiceMade(true);
        if (p.startTime) setStartTime(String(p.startTime));
        if (p.stopTime) setStopTime(String(p.stopTime));
        setLocationUnknown(p.location_unknown ?? false);
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
            biopsy: m.biopsy ?? null,
          })));
        }
        setLoadedReviewId(reviewId);
      } catch (e:any) {
        if (!cancelled) setReviewLoadError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [reviewId, canReview]);

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
    if(preserveLocationCoordinates.current || !locationId) return;
    const rec = locList.find(l => l.id === locationId) || locList.find(l => l.name === locationId);
    const displayName = rec?.name ?? locationName ?? locationId;
    if (rec && rec.name) setLocationName(rec.name);
    const apply = (la:number, lo:number, src?:string) => {
      if (preserveLocationCoordinates.current) return;
      if (isReview) preserveLocationCoordinates.current = true;
      setLat(String(Number(la).toFixed(5)));
      setLng(String(Number(lo).toFixed(5)));
      if (src) setCoordSource(src);
      console.log("[Location autofill]", displayName, src, la, lo);
    };
    if (rec && rec.latitude != null && rec.longitude != null) { apply(Number(rec.latitude), Number(rec.longitude), "location defaults"); return; }
    if (!island || !displayName) return;
    let cancelled = false;
    fetchEarliestCoords(island, displayName).then((res)=>{ if(!cancelled && res){ apply(res.lat, res.lon, "earliest sighting"); } }).catch(()=>{});
    return () => { cancelled = true; };
  },[locationId, locList, island, isReview]);

  // Submit (user mode)
  const handleSubmit = async () => {
    if (submissionIssues.length > 0) return;
    const invalidBiopsy = mantas.find((m) => validateOrganicBiopsy(m.biopsy));
    if (invalidBiopsy) {
      window.alert(`${invalidBiopsy.name || "Manta"}: ${validateOrganicBiopsy(invalidBiopsy.biopsy)}`);
      return;
    }

    const payload = {
      date, startTime, stopTime, photographer, email, phone,
      location_unknown: locationUnknown,
      island, locationId, locationName,
      latitude: lat, longitude: lng,
      mantas, methods, standardize_survey: standardizeSurvey, notes
    };

    let submissionId: string | undefined;
    try {
      const { data, error } = await supabase.from("sighting_submissions").insert({
        email: email || null,
        sighting_date: date || null,
        manta_count: mantas.length,
        photo_count: totalPhotos,
        payload,
        status: "pending"
      }).select("id").single();
      if (error) throw error;
      submissionId = data?.id;
    } catch (error: unknown) {
      window.alert(error instanceof Error ? error.message : "Sighting submission failed.");
      return;
    }

    if (submissionId) await notifySubmission(submissionId);
    else console.warn("Admin notification skipped: saved submission ID unavailable.");

    setSuccessMessage(`Your sighting has been submitted for review with ${mantas.length} mantas and ${totalPhotos} photos. Thank you!`);
    setSuccessOpen(true);
  };

  // Save handlers for Add/Edit manta
  const onAddSave = async (m: MantaDraft) => {
    console.log("[AddSighting][onAddSave] received manta", m);

    setAddOpen(false);
    if (!isReview) setNextMantaSequence(sequence => sequence + 1);
    setMantas(prev => {
      const incomingId = (m as any).id ? String((m as any).id) : "";
      const exists = incomingId && prev.some(p => String(p.id) === incomingId);
      const id = exists || !incomingId ? uuid() : incomingId;
      const next = [...prev, { ...(m as any), id }];
      console.log("[AddSighting][onAddSave] next mantas", next);
      return next;
    });

    const surveyHasLocation = !!String(locationId || locationName || "").trim();
    const exif = m.firstExifMeta;
    if (!surveyHasLocation && typeof exif?.lat === "number" && typeof exif?.lon === "number") {
      await prepareExifSuggestion(exif);
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
        if (keep.biopsy && !merged.biopsy) merged.biopsy = keep.biopsy;
        const c=[...prev]; c[i]=merged as any; return c;
      }
      return [...prev, m];
    });
    setEditingManta(null);
  };

  function currentReviewPayload() {
    return {
      date, startTime, stopTime, photographer, email, phone,
      location_unknown: locationUnknown,
      island, locationId, locationName, latitude: lat, longitude: lng,
      mantas, methods, standardize_survey: standardizeSurvey, notes
    };
  }

  function reviewIsValid() {
    if (!reviewId || !canReview || loadedReviewId !== reviewId || reviewBusy) return false;
    if (needsTimeReview) {
      window.alert("Review the sighting date and survey times for photos spanning multiple dates.");
      return false;
    }
    const invalidBiopsy = mantas.find((m) => validateOrganicBiopsy(m.biopsy));
    if (invalidBiopsy) {
      window.alert(`${invalidBiopsy.name || "Manta"}: ${validateOrganicBiopsy(invalidBiopsy.biopsy)}`);
      return false;
    }
    return true;
  }

  async function handleSaveReview() {
    if (!reviewIsValid()) return;
    setReviewBusy(true);
    try {
      await saveReviewServer(reviewId, currentReviewPayload());
      window.alert("Saved ✓");
    } catch {
      window.alert("Save failed. Review changes were not confirmed saved.");
    } finally {
      setReviewBusy(false);
    }
  }

  // Both approval paths save current reviewed values before invoking the RPC.
  async function handleCommitReview() {
    if (!reviewIsValid()) return;
    if (approvalIssues.length > 0) {
      window.alert(approvalIssues.join("\n"));
      return;
    }
    if (!window.confirm("Commit this submission to final tables?")) return;
    setReviewBusy(true);
    try {
      const payload = currentReviewPayload();
      await saveReviewServer(reviewId, payload);
      const commitFunction = hasOrganicBiopsies(payload.mantas)
        ? "commit_sighting_submission_with_biopsies"
        : "commit_sighting_submission";
      const { error } = await supabase.rpc(commitFunction, { sub_id: reviewId });
      if (error) throw error;
      window.alert("Committed.");
      navigate(returnPath);
    } catch (error) {
      window.alert(approvalFailureMessage(error));
    } finally {
      setReviewBusy(false);
    }
  }

  async function handleRejectReview() {
    if (!reviewId || !canReview || loadedReviewId !== reviewId || reviewBusy) return;
    if (!window.confirm("Are you sure you want to reject this submission?")) return;
    setReviewBusy(true);
    try {
      const { data, error } = await supabase.from("sighting_submissions")
        .update({ status: "rejected", rejected_at: new Date().toISOString() })
        .eq("id", reviewId).eq("status", "pending")
        .select("id").single();
      if (error || !data) throw error || new Error("Submission was not updated");
      window.alert("Submission rejected.");
      navigate(returnPath);
    } catch {
      window.alert("Rejection failed. The submission was not confirmed rejected.");
    } finally {
      setReviewBusy(false);
    }
  }

  // MantasList hooks
  const onEdit = (m: MantaDraft) => setEditingManta(m);
  const onRemove = (id: string) => setMantas(prev => prev.filter(x => String(x.id) !== String(id)));
  const allowMatching = access.isActive === true && (access.role === "user" || access.role === "admin");
  const openMatch = (m: MantaDraft, ventralUrl?: string) => {
    if (!allowMatching || !ventralUrl) return;
    setPageMatchMeta({ name: m.name, gender: (m as any).gender ?? null, ageClass: (m as any).ageClass ?? null, meanSize: (m as any).size ?? null });
    setPageMatchUrl(ventralUrl || "");
    setPageMatchFor(String(m.id));
    setPageMatchOpen(true);
  };

  // UI
  if (isReview && access.loading) return <Layout><p role="status">Checking administrator access…</p></Layout>;
  if (isReview && !canReview) return <Layout><p role="alert">Active administrator access is required to review submissions.</p></Layout>;
  if (isReview && reviewLoadError) return <Layout><p role="alert">Could not load this submission for review.</p></Layout>;
  if (isReview && loadedReviewId !== reviewId) return <Layout><p role="status">Loading submission…</p></Layout>;

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
  showSize={methods.pairedLaser}
  open={addOpen}
  onClose={()=>setAddOpen(false)}
  sightingId={formSightingId}
  onSave={onAddSave}
  automaticName={isReview ? undefined : mantaLabel(nextMantaSequence)}
/>
<UnifiedMantaModal
  showSize={methods.pairedLaser}
  open={!!editingManta}
  onClose={()=>setEditingManta(null)}
  sightingId={formSightingId}
  existingManta={editingManta || undefined}
  automaticName={isReview ? undefined : editingManta?.name}
  onSave={onEditSave}
/>

<Dialog open={methodsDialogOpen} onOpenChange={(open) => {
  // Initial setup requires Continue, including when no methods are selected.
  if (methodsConfirmed) setEditMethodsOpen(open);
}}>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-[300001] bg-black/30" />
    <DialogPrimitive.Content
      className="fixed left-1/2 top-1/2 z-[300002] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-white p-6 shadow-lg"
      aria-describedby={undefined}
      onEscapeKeyDown={(event) => { if (!methodsConfirmed) event.preventDefault(); }}
      onPointerDownOutside={(event) => event.preventDefault()}
    >
      <DialogTitle>Methods used during this sighting</DialogTitle>
      <div role="radiogroup" aria-label="Survey type" className="mt-4 space-y-2 text-sm">
        <div className="font-medium">Survey type</div>
        {([['No', 'Opportunistic sighting/photos'], ['Yes', 'Systematic survey']] as const).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input type="radio" name="survey-type" value={value} checked={standardizeSurvey === value}
              onChange={() => setStandardizeSurvey(value)} />{label}
          </label>
        ))}
      </div>
      <div className="my-5 space-y-3 text-sm">
        {METHOD_OPTIONS.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={methods[key]}
              onChange={(event) => {
                const checked = event.target.checked;
                setMethods((current) => ({ ...current, [key]: checked }));
              }}
            />
            {label}
          </label>
        ))}
      </div>
      <Button type="button" className="w-full" onClick={() => {
        setMethodsConfirmed(true);
        setEditMethodsOpen(false);
      }}>Continue</Button>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</Dialog>

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
            <div>
              <input aria-label="Sighting Date" type="date" value={date} onChange={(e)=>editTime("date", e.target.value)}
                aria-invalid={showFieldIssue("date")} aria-describedby={showFieldIssue("date") ? "date-required" : undefined}
                className={"w-full border rounded px-3 py-2 " + (showFieldIssue("date") ? "border-red-500" : "")} />
              {showFieldIssue("date") && <div id="date-required" className="text-xs text-red-600 mt-1">Sighting date is required.</div>}
            </div>
            <label className="text-sm">Start Time{standardizeSurvey === "Yes" && <span className="text-slate-500"> (required)</span>}
              <input aria-label="Start Time" type="time" step="1" value={startTime} onChange={(e)=>editTime("start", e.target.value)}
                aria-invalid={showFieldIssue("startTime")} aria-describedby={showFieldIssue("startTime") ? "start-required" : undefined}
                className={"block w-full border rounded px-3 py-2 " + (showFieldIssue("startTime") ? "border-red-500" : "")} />
              {showFieldIssue("startTime") && <span id="start-required" className="text-xs text-red-600">Start time is required.</span>}
            </label>
            <label className="text-sm">Stop Time{standardizeSurvey === "Yes" && <span className="text-slate-500"> (required)</span>}
              <input aria-label="Stop Time" type="time" step="1" value={stopTime} onChange={(e)=>editTime("stop", e.target.value)}
                aria-invalid={showFieldIssue("stopTime")} aria-describedby={showFieldIssue("stopTime") ? "stop-required" : undefined}
                className={"block w-full border rounded px-3 py-2 " + (showFieldIssue("stopTime") ? "border-red-500" : "")} />
              {showFieldIssue("stopTime") && <span id="stop-required" className="text-xs text-red-600">{submissionIssues.find(issue => issue.field === "stopTime")?.message === TIME_ORDER_MESSAGE ? TIME_ORDER_MESSAGE : "Stop time is required."}</span>}
            </label>
            <div className="md:col-span-3 text-xs text-slate-600 space-y-1">
              <div>{standardizeSurvey === "Yes" ? "Systematic survey — actual survey effort times" : standardizeSurvey === "No" ? (timesManuallyEdited ? "Opportunistic sighting — manually adjusted times" : "Opportunistic sighting — times from photo metadata") : "Survey type not specified"}</div>
              {photoBounds && <div>Photo timestamps: {photoBounds.first.replace("T", " ")} – {photoBounds.last.replace("T", " ")}</div>}
              {photoBounds?.multipleDates && (
                <div role="status" className="text-amber-800">
                  {MULTI_DATE_REVIEW_MESSAGE}
                  {needsTimeReview && <button type="button" className="ml-2 underline disabled:opacity-50"
                    disabled={!date || !startTime || !stopTime}
                    onClick={() => { retainEffort(); setReviewedPhotoDates(multiDateKey); }}>
                    Use reviewed survey times
                  </button>}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {methodsConfirmed && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>Survey type: {standardizeSurvey === "Yes" ? "Systematic survey" : standardizeSurvey === "No" ? "Opportunistic sighting/photos" : "Not specified"}</span>
            <span>Methods: {METHOD_OPTIONS.filter(([key]) => methods[key]).map(([, , label]) => label).join(", ") || "None"}</span>
            <button type="button" className="text-sky-700 underline" onClick={() => setEditMethodsOpen(true)}>
              Edit Methods
            </button>
          </div>
        )}

        {/* Photographer & Contact */}
        <Card>
          <CardHeader><CardTitle>Photographer & Contact</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-3">
            <input placeholder="Photographer" value={photographer} onChange={(e)=>setPhotographer(e.target.value)} className="border rounded px-3 py-2" />
            <div>
              <input id="contact-email-field" aria-label="Email" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)}
                aria-invalid={showFieldIssue("email")} aria-describedby={showFieldIssue("email") ? "email-required" : undefined}
                className={"w-full border rounded px-3 py-2 " + ((isReview ? email && !emailValid : showFieldIssue("email")) ? "border-red-500" : "")} />
              {showFieldIssue("email") && <div id="email-required" className="text-xs text-red-600 mt-1">Enter a valid email address.</div>}
            </div>
            <input placeholder="Phone" value={phone} onChange={(e)=>setPhone(e.target.value)} className="border rounded px-3 py-2" />
            {isReview && !emailValid && <div className="text-xs text-red-500 md:col-span-3">An email address is required.</div>}
          </CardContent>
        </Card>

        {/* Location */}
        <Card className={showFieldIssue("location") ? "border-red-500" : ""}>
          <CardHeader><CardTitle>Location</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={locationUnknown} onChange={(e) => setLocationUnknown(e.target.checked)} />
              Location unknown
            </label>
            <fieldset disabled={locationUnknown} className="space-y-3 disabled:opacity-50" aria-describedby={showFieldIssue("location") ? "location-required" : undefined}>

  <div className="grid md:grid-cols-2 gap-3">
    {/* Island select */}
    <select value={island} onChange={(e)=>setIsland(e.target.value)} className="border rounded px-3 py-2">
  <option value="">{islandsLoading ? 'Loading islands…' : 'Select island'}</option>
  {islands.map(isl => (<option key={isl} value={isl}>{isl}</option>))}
</select>

    {/* Location select + small link underneath */}
    <div className="space-y-1">
  <select
    value={!locationId && !locationName && locationPoint(lat, lng) ? "__custom_coordinates__" : locationId}
    onChange={(e)=>{ preserveLocationCoordinates.current = false; setLocationId(e.target.value); }}
    className="border rounded px-3 py-2"
  >
    <option value="">{island ? 'Select location' : 'Select island first'}</option>
    {!locationId && !locationName && locationPoint(lat, lng) && <option value="__custom_coordinates__" disabled>Custom</option>}
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
  {savedMapPoint && <div role="status" className="text-xs text-emerald-700">✓ Location saved from map</div>}
  <button
    type="button"
    className="px-3 py-2 border rounded"
    onClick={()=>setMapOpen(true)}
  >
    Use Map for Location
  </button>
            </fieldset>
            {showFieldIssue("location") && <div id="location-required" className="text-xs text-red-600">Select a location, choose a point on the map, or check “Location unknown.”</div>}
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
              showSize={methods.pairedLaser}
              mantas={mantas}
              setMantas={setMantas}
              onEdit={onEdit}
              onRemove={onRemove}
              openMatch={openMatch}
              totalPhotosAll={totalPhotosAll}
              sightingDate={date}
              allowBiopsyEntry={methods.biopsySampling && access.isActive === true && (access.role === "user" || access.role === "admin")}
              allowMatching={allowMatching}
            />
            <div className="mt-3">
              <Button type="button" data-clean-id="add-mantas" onClick={()=>setAddOpen(true)}>Add Mantas</Button>
            </div>
          </CardContent>
        </Card>

        {/* Footer buttons */}
        {readinessMessages.length > 0 && (
          <div id="submission-issues" role="status" className="text-sm text-slate-600 text-center">
            <span className="font-medium">Still needed:</span>{" "}
            {readinessMessages.join(" · ")}
          </div>
        )}
        <div className="flex justify-center mt-6 gap-2">
          {isReview ? (
            <>
              <Button variant="destructive" disabled={reviewBusy} onClick={handleRejectReview}>Reject</Button>
            <Button variant="outline" onClick={() => navigate(returnPath)}>Cancel</Button>
            <Button variant="secondary" disabled={reviewBusy} onClick={handleSaveReview}>Save Changes</Button>
                        <Button disabled={reviewBusy || approvalIssues.length > 0} aria-describedby={approvalIssues.length ? "submission-issues" : undefined} onClick={handleCommitReview}>Commit Review</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => navigate("/dashboard")}>Cancel</Button>
              <Button data-clean-id="submit-sighting" onClick={handleSubmit} aria-describedby={submissionIssues.length ? "submission-issues" : undefined} disabled={submissionIssues.length > 0}>
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
        rankedEnabled={allowMatching}
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

      <Dialog open={!!photoBounds && !timeChoiceMade && !isReview && !addOpen && !editingManta && !confirmExifOpen}
        onOpenChange={(open) => { if (!open) setTimeChoiceMade(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Photo timestamps found</DialogTitle>
            <DialogDescription>
              {standardizeSurvey === "Yes" ? "Photo times are reference only. Enter or retain the actual time spent searching for mantas." : "Photo timestamps provide the default sighting times. You can keep or manually adjust the times."}
            </DialogDescription>
          </DialogHeader>
          {photoBounds && <div className="text-sm space-y-2">
            <div>Capture date: {photoBounds.multipleDates ? `${photoBounds.first.slice(0, 10)} – ${photoBounds.last.slice(0, 10)}` : photoBounds.date}</div>
            <div>Photo time range: {photoBounds.start} – {photoBounds.stop}</div>
            {(startTime || stopTime) && <div>Current survey times: {startTime || "—"} – {stopTime || "—"}. {standardizeSurvey === "No" ? "Manual values are retained unless you choose Use Photo Times." : "These effort times are retained."}</div>}
            {photoBounds.multipleDates && <div className="text-amber-800">Photos span multiple dates. Review the sighting date and survey times manually.</div>}
          </div>}
          <div className="flex flex-wrap justify-end gap-2">
            {standardizeSurvey === "No" && <Button variant="outline" disabled={photoBounds?.multipleDates} autoFocus={!timesManuallyEdited && !photoBounds?.multipleDates} onClick={() => {
              setTimesManuallyEdited(false); setTimeChoiceMade(true);
            }}>Use Photo Times</Button>}
            <Button autoFocus={standardizeSurvey !== "No" || timesManuallyEdited || photoBounds?.multipleDates} onClick={retainEffort}>{standardizeSurvey === "Yes" ? "Enter/Retain Survey Effort Times" : "Keep/Adjust Times"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Map modal: only Save commits the draft coordinates. */}
      {mapOpen && (
        <LocationPickerModal
          initialPoint={initialLocationPoint(lat, lng, locList.find((location) => location.id === locationId || location.name === locationId))}
          onCancel={() => setMapOpen(false)}
          initialLocation={{ locationId, locationName, coordSource }}
          onSave={(point, names) => {
            preserveLocationCoordinates.current = true;
            setLocationId(names.locationId);
            setLocationName(names.locationName);
            const saved = formatLocationPoint(point);
            setLat(saved.lat);
            setLng(saved.lng);
            setCoordSource("map picker");
            setSavedMapPoint(saved);
            setMapOpen(false);
          }}
        />
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
