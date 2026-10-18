import React from "react";
import { Pencil } from "lucide-react";
import { isExternal, invalidExternalMeasurement, photoMeasurementMeters, type PhotoMeasurement } from "@/features/photos/photoMeasurements";

type Props = { id: string; isPhotogrammetry?: boolean | null; measure?: PhotoMeasurement; disabled: boolean;
  onChange: (value?: PhotoMeasurement) => void; onMeasure: () => void };
export default function PhotoMeasurementControls({ id, isPhotogrammetry, measure, disabled, onChange, onMeasure }: Props) {
  const external = isExternal(measure);
  const values = photoMeasurementMeters({ measure });
  return <div className="relative flex min-w-0 flex-wrap items-center gap-1 text-xs">
    <div className="shrink-0">
      <span className="whitespace-nowrap font-medium">{values.dw !== undefined ? `DW: ${values.dw.toFixed(2)} m` : values.dl !== undefined ? `DL: ${values.dl.toFixed(2)} m` : "—"}</span>
    </div>
    {isPhotogrammetry && (values.dw !== undefined || values.dl !== undefined
      ? <button type="button" aria-label={`Edit Size Measurement ${id}`} className="flex min-h-11 min-w-11 items-center justify-center lg:min-h-8 lg:min-w-8" disabled={disabled} onClick={onMeasure}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>
      : <button type="button" className="min-h-11 whitespace-nowrap rounded px-1 underline lg:min-h-8" disabled={disabled} onClick={onMeasure}>Measure Size</button>)}
    <details onToggle={event => {
      if (event.currentTarget.open) event.currentTarget.lastElementChild?.scrollIntoView({ block: "nearest" });
    }}>
      <summary aria-label={`Edit size ${id}`} className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 lg:min-h-8 lg:min-w-8 [&::-webkit-details-marker]:hidden">
        <span className="text-[10px] underline">Size edit</span>
      </summary>
      <div className="absolute left-0 top-full z-20 mt-1 flex w-[min(320px,calc(100vw-4rem))] flex-wrap items-end gap-2 rounded border bg-white p-2 lg:left-auto lg:right-0">
      <label className="min-w-0">Measurement source
        <select aria-label={`Measurement source ${id}`} className="block min-h-11 max-w-full rounded border p-1 lg:min-h-8" disabled={disabled}
          value={external ? "external" : "in_app"} onChange={e => {
            if (measure && !window.confirm("Replace this photo’s existing measurement?")) return;
            onChange(e.target.value === "external" ? { source: "external", metric: "dw", valueMeters: null, units: "m" } : undefined);
          }}>
          <option value="in_app">Measured in MantaTracker</option><option value="external">Externally calculated</option>
        </select>
      </label>
      {external ? <>
        <label>Measurement type<select aria-label={`Measurement type ${id}`} className="block min-h-11 rounded border p-1 lg:min-h-8" disabled={disabled}
          value={measure.metric} onChange={e => onChange({ ...measure, metric: e.target.value as "dw" | "dl" })}>
          <option value="dw">Disc width (DW)</option><option value="dl">Disc length (DL)</option>
        </select></label>
        <label>Value (m)<input aria-label={`Measurement value ${id}`} className="block min-h-11 w-24 rounded border p-1 lg:min-h-8" type="number" min="0" step="any"
          disabled={disabled} value={measure.valueMeters ?? ""} onChange={e => onChange({ ...measure, valueMeters: e.target.value === "" ? null : Number(e.target.value) })} /></label>
      </> : !isPhotogrammetry && <button type="button" className="min-h-11 rounded border px-2 py-1 lg:min-h-8" disabled={disabled} onClick={onMeasure}>Measure in MantaTracker</button>}
      {measure && <button type="button" className="min-h-11 underline lg:min-h-8" disabled={disabled} onClick={() => onChange(undefined)}>Remove measurement</button>}
      {invalidExternalMeasurement({ measure }) && <p role="alert" className="w-full text-red-700">Enter a positive measurement in meters, or clear the value.</p>}
      {!external && values.dl !== undefined && <p className="w-full">DL: {values.dl.toFixed(2)} m{values.dw !== undefined && ` · DW: ${values.dw.toFixed(2)} m`}</p>}
      </div>
    </details>
  </div>;
}
