import React, { useState } from "react";
import { isExternal, invalidExternalMeasurement, photoMeasurementMeters, type PhotoMeasurement } from "@/features/photos/photoMeasurements";

type Props = { id: string; isPhotogrammetry?: boolean | null; measure?: PhotoMeasurement; disabled: boolean;
  onDesignation: (value: boolean) => void; onChange: (value?: PhotoMeasurement) => void; onMeasure: () => void };
export default function PhotoMeasurementControls({ id, isPhotogrammetry, measure, disabled, onDesignation, onChange, onMeasure }: Props) {
  const [expanded, setExpanded] = useState(false);
  const external = isExternal(measure);
  const values = photoMeasurementMeters({ measure });
  return <div className="col-span-full border-t pt-2 text-sm space-y-2">
    <label className="flex items-center gap-2"><input type="checkbox" disabled={disabled} checked={isPhotogrammetry === true}
      onChange={e => onDesignation(e.target.checked)} />Photogrammetry</label>
    {isPhotogrammetry == null && <span className="text-xs text-slate-500">Designation not specified</span>}
    {isPhotogrammetry && (!measure || (external && measure.valueMeters === null)) && <p className="text-xs text-slate-500">No numeric measurement entered.</p>}
    {(isPhotogrammetry || measure || expanded) ? <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-0">Measurement source
        <select aria-label={`Measurement source ${id}`} className="block border rounded p-2 max-w-full" disabled={disabled}
          value={external ? "external" : "in_app"} onChange={e => {
            if (measure && !window.confirm("Replace this photo’s existing measurement?")) return;
            onChange(e.target.value === "external" ? { source: "external", metric: "dw", valueMeters: null, units: "m" } : undefined);
          }}>
          <option value="in_app">Measured in MantaTracker</option><option value="external">Externally calculated</option>
        </select>
      </label>
      {external ? <>
        <label>Measurement type<select aria-label={`Measurement type ${id}`} className="block border rounded p-2" disabled={disabled}
          value={measure.metric} onChange={e => onChange({ ...measure, metric: e.target.value as "dw" | "dl" })}>
          <option value="dw">Disc width (DW)</option><option value="dl">Disc length (DL)</option>
        </select></label>
        <label>Value (m)<input aria-label={`Measurement value ${id}`} className="block border rounded p-2 w-28" type="number" min="0" step="any"
          disabled={disabled} value={measure.valueMeters ?? ""} onChange={e => onChange({ ...measure, valueMeters: e.target.value === "" ? null : Number(e.target.value) })} /></label>
      </> : <button type="button" className="border rounded px-3 py-2" disabled={disabled} onClick={onMeasure}>Measure in MantaTracker</button>}
      {measure && <button type="button" className="underline py-2" disabled={disabled} onClick={() => onChange(undefined)}>Remove measurement</button>}
      {invalidExternalMeasurement({ measure }) && <p role="alert" className="w-full text-red-700">Enter a positive measurement in meters, or clear the value.</p>}
      {measure && !external && <p className="w-full text-xs">DL: {values.dl?.toFixed(2)} m · DW: {values.dw?.toFixed(2)} m · Source: Measured in MantaTracker</p>}
    </div> : <button type="button" className="underline" disabled={disabled} onClick={() => setExpanded(true)}>Add measurement</button>}
  </div>;
}
