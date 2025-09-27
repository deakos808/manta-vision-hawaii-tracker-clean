
}


      <Layout>
        {/* Hero */}
        <div className="bg-gradient-to-r from-sky-600 to-blue-700 py-10 text-white">
          <div className="max-w-5xl mx-auto px-4 text-center">
            <h1 className="text-3xl font-semibold">Add Manta Sighting</h1>
            <p className="text-sm opacity-90 mt-1">sighting: {formSightingId.slice(0,8)}</p>
          </div>
        </div>

        {/* Breadcrumb under header (left-aligned) */}
        <div className="bg-white">
          <div className="max-w-5xl mx-auto px-4 py-3 text-sm text-slate-600">
            <a href="/browse" className="underline text-sky-700">Return to Browse Data</a>
            <span className="mx-2">/</span>
            <span className="text-slate-400">Sightings</span>
            <span className="mx-2">/</span>
            <span className="font-medium">Add</span>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-5xl mx-auto px-4 pb-10 space-y-6">

          {/* Sighting Details: Date, Start, Stop */}
          <Card>
            <CardHeader><CardTitle>Sighting Details</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-3">
              <input type="date" className="border rounded px-3 py-2" value={date} onChange={(e)=>setDate(e.target.value)} />
              <select className="border rounded px-3 py-2" value={startTime} onChange={(e)=>setStartTime(e.target.value)}>
                <option value="">Start Time</option>
                {TIME_OPTIONS.map(t=><option key={"s-"+t} value={t}>{t}</option>)}
              </select>
              <select className="border rounded px-3 py-2" value={stopTime} onChange={(e)=>setStopTime(e.target.value)}>
                <option value="">Stop Time</option>
                {TIME_OPTIONS.map(t=><option key={"e-"+t} value={t}>{t}</option>)}
              </select>
            </CardContent>
          </Card>

          {/* Photographer / Contact */}
          <Card>
            <CardHeader><CardTitle>Photographer & Contact</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-3">
              <input className="border rounded px-3 py-2" placeholder="Photographer" value={photographer} onChange={(e)=>setPhotographer(e.target.value)} />
              <input className="border rounded px-3 py-2" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} />
              <input className="border rounded px-3 py-2" placeholder="Phone" value={phone} onChange={(e)=>setPhone(e.target.value)} />
            </CardContent>
          </Card>

          {/* Location */}
          <Card>
            <CardHeader><CardTitle>Location</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <select className="border rounded px-3 py-2" value={island} onChange={(e)=>setIsland(e.target.value)}>
                  <option value="">Select island</option>
                  {ISLANDS.map(i=> <option key={i} value={i}>{i}</option>)}
                </select>

                {/* Dependent Location dropdown */}
                <div>
                  <select
                    className="border rounded px-3 py-2 w-full"
                    value={locationId}
                    onChange={(e)=>setLocationId(e.target.value)}
                    disabled={!island}
                  >
                    <option value="">{island ? "Select location" : "Select island first"}</option>
                    {locList.map(loc=> <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                  </select>
                  <div className="text-xs mt-1">
                    <button
                      className="text-sky-700 underline disabled:text-slate-400"
                      disabled={!island}
                      onClick={(e)=>{e.preventDefault(); setAddingLoc(v=>!v);}}
                    >
                      Not listed? Add new
                    </button>
                  </div>
                  {addingLoc && (
                    <div className="mt-2 flex gap-2">
                      <input className="border rounded px-3 py-2 flex-1" placeholder="New location name" value={newLoc} onChange={(e)=>setNewLoc(e.target.value)} />
                      <Button onClick={addNewLocation} disabled={!newLoc.trim() || !island}>Add</Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600">Latitude</label>
                  <input
                    type="number"
                    step="0.00001"
                    inputMode="decimal"
                    className="border rounded px-3 py-2 w-full"
                    placeholder="19.44400"
                    value={lat}
                    onChange={(e)=>setLat(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Longitude</label>
                  <input
                    type="number"
                    step="0.00001"
                    inputMode="decimal"
                    className="border rounded px-3 py-2 w-full"
                    placeholder="-156.44400"
                    value={lng}
                    onChange={(e)=>setLng(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Button variant="outline" onClick={()=>setMapOpen(true)}>Use Map for Location</Button>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent>
              <textarea className="w-full border rounded p-2 min-h-[140px]" placeholder="Enter notes about this sighting..." />
            </CardContent>
          </Card>

          {/* Mantas Added above Add button */}
          <Card data-mantas-summary>
            <CardHeader><CardTitle>Mantas Added</CardTitle></CardHeader>
            <CardContent>
      <div data-mantas-headers className="hidden md:grid grid-cols-12 text-[11px] uppercase tracking-wide text-gray-500 px-3 pb-1">
        <div className="col-span-5">Name</div>
        <div className="col-span-2">Gender</div>
        <div className="col-span-3">Age Class</div>
        <div className="col-span-2">Size (cm)</div>
      </div>
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
                            <div className="text-xs text-gray-500 truncate">
                              {/* gender · age · size if available */}
                              {[
                                m.gender ? `Gender: ${m.gender}` : null,
                                m.ageClass ? `Age: ${m.ageClass}` : null,
                                m.size ? `Size: ${m.size}` : null
                              ].filter(Boolean).join(" · ") || "—"}
                            </div>
                            <div className="text-[11px] text-gray-400">{m.photos?.length || 0} photos</div>
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

          <div className="flex justify-start">
            <Button onClick={()=>setAddOpen(true)}>Add Mantas</Button>
          </div>

          <div id="probe-add-sighting-v2" className="mx-auto mt-2 max-w-5xl px-4 text-[10px] text-muted-foreground">probe:add-sighting-v2</div>
        </div>
      
      <MapPickerModal
        data-leaflet-picker
        open={mapOpen}
        lat={lat?Number(lat):null}
        lng={lng?Number(lng):null}
        onClose={()=>setMapOpen(false)}
        onApply={(la,lo)=>{ setLat(String(la.toFixed(5))); setLng(String(lo.toFixed(5))); setMapOpen(false); }}
      /></Layout>
    </>
  );
}
