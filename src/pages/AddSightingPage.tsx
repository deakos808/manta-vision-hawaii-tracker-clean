import React, { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import UnifiedMantaModal, { type MantaDraft } from "@/components/mantas/UnifiedMantaModal";

function uuid(){ try { return (crypto as any).randomUUID(); } catch { return Math.random().toString(36).slice(2); } }

export default function AddSightingPage() {
  const [mantas, setMantas] = useState<MantaDraft[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editingManta, setEditingManta] = useState<MantaDraft|null>(null);
  const formSightingId = useMemo(()=>uuid(), []);
  useEffect(()=>{ console.log("[AddSighting] mounted"); }, []);

  const onAddSave = (m: MantaDraft) => {
    console.log("[AddSighting] unified add save", m);
    setMantas(prev=>[...prev, m]);
    setAddOpen(false);
  };
  const onEditSave = (m: MantaDraft) => {
    console.log("[AddSighting] unified edit save", m);
    setMantas(prev=>{ const i=prev.findIndex(x=>x.id===m.id); if(i>=0){ const c=[...prev]; c[i]=m; return c; } return [...prev, m]; });
    setEditingManta(null);
  };

  return (
    <>
      <UnifiedMantaModal
        data-unified-add-modal
        open={addOpen}
        onClose={()=>setAddOpen(false)}
        sightingId={formSightingId}
        onSave={onAddSave}
      />
      <UnifiedMantaModal
        data-unified-edit-modal
        open={!!editingManta}
        onClose={()=>setEditingManta(null)}
        sightingId={formSightingId}
        existingManta={editingManta || undefined}
        onSave={onEditSave}
      />

      <Layout>
        <div className="bg-gradient-to-r from-sky-600 to-blue-700 text-white py-10">
          <div className="max-w-5xl mx-auto px-4">
            <h1 className="text-2xl font-semibold">Add Manta Sighting</h1>
            <p className="text-sm opacity-90">sighting: {formSightingId.slice(0,8)}</p>
            <div className="mt-3">
              <Button variant="secondary" onClick={()=>setAddOpen(true)}>Add Mantas</Button>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          <Card>
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent>
              <textarea className="w-full border rounded p-2 min-h-[120px]" placeholder="Enter notes about this sighting..." />
            </CardContent>
          </Card>

          <Card data-mantas-summary>
            <CardHeader><CardTitle>Mantas Added</CardTitle></CardHeader>
            <CardContent>
              {mantas.length === 0 ? (
                <div className="text-sm text-gray-600">No mantas added yet.</div>
              ) : (
                <ul className="divide-y rounded border">
                  {mantas.map((m,i)=>{
                    const ventralBest = m.photos?.find(p=>p.view==="ventral" && p.isBestVentral) || m.photos?.find(p=>p.view==="ventral");
                    const dorsalBest  = m.photos?.find(p=>p.view==="dorsal"  && p.isBestDorsal)  || m.photos?.find(p=>p.view==="dorsal");
                    return (
                      <li key={m.id} className="p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex items-center gap-2 shrink-0">
                            {ventralBest ? <img src={ventralBest.url} alt="best ventral" className="w-10 h-10 object-cover rounded" /> : <div className="w-10 h-10 rounded bg-gray-100 grid place-items-center text-[10px] text-gray-400">no V</div>}
                            {dorsalBest  ? <img src={dorsalBest?.url} alt="best dorsal"  className="w-10 h-10 object-cover rounded" /> : <div className="w-10 h-10 rounded bg-gray-100 grid place-items-center text-[10px] text-gray-400">no D</div>}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{m.name || `Manta ${i+1}`}</div>
                            <div className="text-xs text-gray-500">{m.photos?.length || 0} photos</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" className="px-2 py-1 border rounded text-xs" onClick={()=>{ console.log("[AddSighting] edit manta", m.id); setEditingManta(m); }}>Edit</button>
                          <button type="button" className="px-2 py-1 border rounded text-xs" onClick={()=>{ console.log("[AddSighting] remove manta", m.id); setMantas(prev=>prev.filter(x=>x.id!==m.id)); }}>Remove</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <div id="probe-add-sighting-v2" className="mx-auto mt-2 max-w-3xl px-4 text-[10px] text-muted-foreground">probe:add-sighting-v2</div>
        </div>
      </Layout>
    </>
  );
}
