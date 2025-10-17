import { useState } from "react";
import { Link } from "react-router-dom";
import { fmtMeters } from "../../utils/format";

export default function AddCalibrationPage(){
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
            <input value={cameraModel} onChange={e=>setCameraModel(e.target.value)} className="border rounded-md px-3 py-2" placeholder="e.g., Sony A7R IV" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Lens Type</span>
            <input value={lensType} onChange={e=>setLensType(e.target.value)} className="border rounded-md px-3 py-2" placeholder="e.g., 24–70mm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Paired-Laser Setup</span>
            <input value={laserSetup} onChange={e=>setLaserSetup(e.target.value)} className="border rounded-md px-3 py-2" placeholder="e.g., 60 cm baseline rig" />
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
          <p className="text-xs text-slate-500 mt-1">v1 uses a single session scale. (Per‑photo overrides reserved for future.)</p>
        </div>
      </div>

      {/* Photos list placeholder (will wire up next) */}
      <div className="rounded-lg border p-6 bg-white">
        <div className="text-sm text-slate-600">Photos area coming next: drag & drop images, draw scale/object lines, enter actual length (m).</div>
      </div>
    </div>
  );
}
