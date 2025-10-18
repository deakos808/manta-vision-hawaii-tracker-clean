import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fmtMeters } from "../../utils/format";
import CalibrationPhotoCard, { PhotoResult } from "../../components/calibration/CalibrationPhotoCard";
import { saveCalibrationSession } from "../../services/calibration";

export default function AddCalibrationPage(){
  const navigate = useNavigate();
  const [photographerName, setPhotographerName] = useState("");
  const [cameraModel, setCameraModel] = useState("");
  const [lensType, setLensType] = useState("");
  const [laserSetup, setLaserSetup] = useState("");
  const [defaultScaleM, setDefaultScaleM] = useState<number>(0.60);
  const [editingScale, setEditingScale] = useState(false);

  return (
    <div className="p-6">
      <div className="mb-4">
        <nav className="text-sm mb-2">
          <Link to="/admin" className="text-sky-700 hover:underline">Admin</Link>
          <span className="mx-1">/</span>
          <Link to="/admin/calibration" className="text-sky-700 hover:underline">Calibration</Link>
          <span className="mx-1">/</span>
          <span className="text-slate-500">New</span>
        </nav>
        <h1 className="text-2xl font-semibold">New Calibration</h1>
        <p className="text-sm text-slate-600">Session metadata + photos. All lengths in meters (2 decimals).</p>
      </div>

      {/* Header form */}
      <div className="rounded-lg border p-4 bg-white mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Photographer Name</span>
            <input value={photographerName} onChange={e=>setPhotographerName(e.target.value)} className="border rounded-md px-3 py-2" placeholder="e.g., J. Doe" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Camera Model</span>
            <input value={cameraModel} onChange={e=>setCameraModel(e.target.value)} className="border rounded-md px-3 py-2" placeholder="e.g., OM TG-7" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Lens Type</span>
            <input value={lensType} onChange={e=>setLensType(e.target.value)} className="border rounded-md px-3 py-2" placeholder="e.g., No added lens" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Paired-Laser Setup</span>
            <input value={laserSetup} onChange={e=>setLaserSetup(e.target.value)} className="border rounded-md px-3 py-2" placeholder="e.g., 60 cm Alum V2" />
          </label>
        </div>

        <div className="mt-4">
          <div className="text-sm font-medium">Default Scale (m)</div>
          {!editingScale ? (
            <div className="flex items-center gap-3 mt-1">
              <div className="text-slate-800">{fmtMeters(defaultScaleM)}</div>
              <button type="button" className="text-sky-700 underline text-sm" onClick={()=>setEditingScale(true)}>Change scale</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number" step="0.01" min="0.01"
                value={defaultScaleM}
                onChange={e=>setDefaultScaleM(Number(e.target.value))}
                className="border rounded-md px-3 py-2 w-32"
              />
              <button type="button" className="text-sm rounded-md border px-2 py-1 hover:bg-slate-50" onClick={()=>setEditingScale(false)}>Done</button>
            </div>
          )}
          <p className="text-xs text-slate-500 mt-1">v1 uses a single session scale.</p>
        </div>
      </div>

      <div className="rounded-lg border p-6 bg-white">
        <PhotosSection defaultScaleM={defaultScaleM}
          onSave={async (payload) => {
            await saveCalibrationSession({
              photographer_name: photographerName,
              camera_model: cameraModel,
              lens_type: lensType,
              laser_setup: laserSetup,
              default_scale_m: defaultScaleM,
            }, payload);
            navigate("/admin/calibration");
          }}
        />
      </div>
    </div>
  );
}

/* ---------- Local helpers ---------- */

type PhotoItem = {
  id: string;
  url: string;
  file?: File;
  width: number;
  height: number;
};

function useImageDims(file: File): Promise<{url:string;width:number;height:number}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ url, width: img.width, height: img.height });
    img.onerror = reject;
    img.src = url;
  });
}

function PhotosSection({
  defaultScaleM,
  onSave,
}: {
  defaultScaleM: number;
  onSave: (photos: {
    file: File;
    width: number;
    height: number;
    scalePx: number;
    objectPx: number;
    actualLengthM: number;
    scale: { p0: {x:number,y:number} | null; p1: {x:number,y:number} | null };
    object: { p0: {x:number,y:number} | null; p1: {x:number,y:number} | null };
  }[]) => Promise<void>;
}) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [results, setResults] = useState<Record<string, PhotoResult>>({});
  const [saving, setSaving] = useState(false);

  async function onFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const newItems: PhotoItem[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const meta = await useImageDims(file);
      const maxW = Math.min(640, meta.width);
      newItems.push({
        id: crypto.randomUUID(),
        url: meta.url,
        file,
        width: maxW,
        height: Math.round(meta.height * (maxW / meta.width)),
      });
    }
    setPhotos(prev => [...prev, ...newItems]);
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    await onFiles(e.dataTransfer.files);
  };

  const onCardChange = (id: string, r: PhotoResult) => {
    setResults(prev => ({ ...prev, [id]: r }));
  };

  const complete = photos.filter(p => {
    const r = results[p.id];
    return r && r.estLengthM != null && r.actualLengthM != null && r.errorPct != null && p.file;
  });
  const meanError = complete.length ? (complete.reduce((acc,p)=> acc + (results[p.id].errorPct || 0), 0) / complete.length) : null;
  const incomplete = photos.length - complete.length;

  async function handleSave(){
    if (complete.length < 1 || saving) return;
    setSaving(true);
    try{
      const payload = complete.map(p => {
        const r = results[p.id]!;
        return {
          file: p.file!,
          width: p.width,
          height: p.height,
          scalePx: r.scalePx,
          objectPx: r.objectPx,
          actualLengthM: Number(r.actualLengthM),
          scale: r.scale,
          object: r.object,
        };
      });
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* DnD Zone */}
      <div
        className="rounded-lg border border-dashed p-6 bg-white text-center"
        onDragOver={(e)=>e.preventDefault()}
        onDrop={onDrop}
      >
        <div className="text-sm text-slate-600 mb-3">Drag &amp; drop calibration photos here, or</div>
        <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer hover:bg-slate-50">
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e)=>onFiles(e.target.files)} />
          <span>Select images</span>
        </label>
      </div>

      {/* Photo cards */}
      {photos.length === 0 ? (
        <div className="text-sm text-slate-500">No photos yet.</div>
      ) : (
        <div className="space-y-6">
          {photos.map((p, idx) => (
            <CalibrationPhotoCard
              key={p.id}
              photo={{ id:p.id, url:p.url, width:p.width, height:p.height, file:p.file, label:`#${idx+1}` }}
              defaultScaleM={defaultScaleM}
              onChange={(r)=>onCardChange(p.id, r)}
            />
          ))}
        </div>
      )}

      {/* Summary footer */}
      <div className="sticky bottom-0 mt-4 rounded-lg border bg-white p-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div><span className="text-slate-500">Mean error:</span> {meanError != null ? meanError.toFixed(2) + "%" : "-"}</div>
          <div><span className="text-slate-500"># photos:</span> {photos.length}</div>
          <div>
            <span className="text-slate-500">Complete:</span> {complete.length} &nbsp;|&nbsp; <span className="text-slate-500">Incomplete:</span> {incomplete}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50" onClick={()=>history.back()}>Cancel</button>
            <button
              type="button"
              disabled={complete.length < 1 || saving}
              className={`rounded-md border px-3 py-2 text-sm ${(complete.length<1||saving) ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50"}`}
              onClick={handleSave}
            >
              {saving ? "Saving..." : "Save Calibration"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
