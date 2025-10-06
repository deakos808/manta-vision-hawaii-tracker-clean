import React, { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { useNavigate, useLocation } from "react-router-dom";
import MatchModal from "@/components/mantas/MatchModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import UnifiedMantaModal, { type MantaDraft } from "@/components/mantas/UnifiedMantaModal";
import { supabase } from "@/lib/supabase";
import TempSightingMap from "@/components/map/TempSightingMap";

function uuid(){ try { 
const handleReject = async () => {
  if(!reviewId) return;
  try {
    await supabase.from("sighting_submissions").update({ status: "rejected" }).eq("id", reviewId);
  } catch (_e) {}
  window.alert("Submission rejected.");
  const u = new URL(window.location.href); 
  const ret = u.searchParams.get("return") || "/admin/review";
  navigate(ret);
};

return (crypto as any).randomUUID(); } catch { return Math.random().toString(36).slice(2); } }
function buildTimes(stepMin=5){ const out:string[]=[]; for(let h=0;h<24;h++){ for(let m=0;m<60;m+=stepMin){ out.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);} } return out; }
const TIME_OPTIONS = buildTimes(5);

const ROW_GRID = "grid grid-cols-[220px_minmax(0,1fr)_140px_140px_120px] items-center gap-4";
const useTotalPhotos = (mantas:any[]) => (mantas ?? []).reduce((n,m:any)=> n + (Array.isArray(m?.photos) ? m.photos.length : 0), 0);

// format size to two decimals in cm
function formatCm(v:any){ const n = Number(v); return Number.isFinite(n) ? `${n.toFixed(2)} cm` : "—"; }

type LocRec = { id: string; name: string; island?: string; latitude?: number|null; longitude?: number|null };

export default function AddSightingPage() {
    const navigate = useNavigate();
const location = useLocation();
const [pageMatchOpen, setPageMatchOpen] = useState(false);
  const [pageMatchUrl, setPageMatchUrl] = useState<string>("");
  const [pageMatchMeta, setPageMatchMeta] = useState<{name?:string; gender?:string|null; ageClass?:string|null; meanSize?:number|string|null}>({});
  const [pageMatchFor, setPageMatchFor] = useState<string | null>(null);
const [mantas, setMantas] = useState<MantaDraft[]>([]);
  const totalPhotos = useMemo(() => useTotalPhotos(mantas as any), [mantas]);
  const [addOpen, setAddOpen] = useState(false);
  const [editingManta, setEditingManta] = useState<MantaDraft|null>(null);

  const [date, setDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [stopTime, setStopTime] = useState<string>("");

  const [photographer, setPhotographer] = useState("");
  const [email, setEmail] = useState("");
  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const [phone, setPhone] = useState("");

  const [island, setIsland] = useState("");
  const [islands, setIslands] = useState<string[]>([]);
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

  const [mapOpen, setMapOpen] = useState(false);
  const formSightingId = useMemo(()=>uuid(),[]);
  const [reviewId, setReviewId] = useState<string|null>(null);
  const isReview = !!reviewId;
  const totalPhotosAll = useMemo(() => (mantas ?? []).reduce((a,m)=> a + (Array.isArray((m as any).photos) ? (m as any).photos.length : 0), 0), [mantas]);

  useEffect(()=>{ console.log("[AddSighting] mounted"); }, []);

/* Review mode loader: hydrate reviewId from ?review or ?reviewId and then fetch payload */
useEffect(()=>{
  try {
    const u = new URL(window.location.href);
    const rv = u.searchParams.get("review") || u.searchParams.get("reviewId");
    if (rv) setReviewId(rv);
  } catch {}
},[]);

useEffect(()=>{
  if (!reviewId) return;
  (async ()=>{
    try{
      const { data, error } = await supabase
        .from("sighting_submissions")
        .select("email,sighting_date,payload")
        .eq("id", reviewId)
        .single();
      if (error || !data) return;
      setEmail((data as any).email || "");
      if ((data as any).sighting_date) setDate(String((data as any).sighting_date));
      const p = (data as any).payload || {};
      if (p.photographer) setPhotographer(p.photographer);
      if (p.phone) setPhone(p.phone);
      if (p.island) setIsland(p.island);
      if (p.latitude != null) setLat(String(p.latitude));
      if (p.longitude != null) setLng(String(p.longitude));
      if (Array.isArray(p.mantas)) {
        setMantas(p.mantas.map((m:any)=>({
          id: m.id || Math.random().toString(36).slice(2),
          name: m.name || "",
          gender: m.gender ?? null,
          ageClass: m.ageClass ?? null,
          size: m.size ?? null,
          photos: Array.isArray(m.photos) ? m.photos : [],
          matchedCatalogId: m.matchedCatalogId ?? null,
          noMatch: !!m.noMatch
        })));
      }
    } catch (_err) {}
  })();
},[reviewId]);

<div className="mt-1 text-[11px] text-gray-500">
        Photos: {Array.isArray(m.photos) ? m.photos.length : 0}
      </div>
    </div>
    <div className="w-20 h-20 rounded overflow-hidden border bg-gray-50">
      {dBest ? (
        <img src={dBest.url} alt="Dorsal" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full grid place-items-center text-[10px] text-gray-400">dorsal</div>
      )}
    </div>
  </div>

  <div className="truncate text-center">{m.name || "—"}</div>
  <div className="truncate text-center">{m.gender || "—"}</div>
  <div className="truncate text-center">{m.ageClass || "—"}</div>
  <div className="truncate text-center">{formatCm(m.size)}</div>

  <div className="col-span-full flex justify-end gap-2 mt-2">
    <button type="button" className="px-2 py-1 border rounded text-xs" onClick={()=>setEditingManta(m)}>Edit</button>
    <button type="button" className="px-2 py-1 border rounded text-xs" onClick={()=>setMantas(prev=>prev.filter(x=>x.id!==m.id))}>Remove</button>
  </div>
</li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-start"><Button data-clean-id="add-mantas" onClick={()=>setAddOpen(true)}>Add Mantas</Button></div>
     <div className="flex justify-center mt-6 gap-2">
       {isReview && (<Button variant="destructive" onClick={handleReject}>Reject</Button>)}
       <Button data-clean-id="submit-sighting" onClick={handleSubmit} disabled={!emailValid}>{submitLabel}</Button>
     </div>
{/* MM_MOUNT_START */}
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
{/* MM_MOUNT_END */}
          <div id="probe-add-sighting-v2" className="mx-auto mt-2 max-w-5xl px-4 text-[10px] text-muted-foreground">probe:add-sighting-v2</div>
        </div>
      
</Layout>

  );
}
