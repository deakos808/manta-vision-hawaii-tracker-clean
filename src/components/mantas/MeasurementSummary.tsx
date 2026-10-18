import React from "react";
import { Info } from "lucide-react";
import { isExternal, photoMeasurementMeters, measurementSummary, type MeasuredPhoto } from "@/features/photos/photoMeasurements";
export default function MeasurementSummary({ photos, estimatedSize, legacySize }: { photos: MeasuredPhoto[]; estimatedSize?: string | null; legacySize?: string | null }) {
  const summary = measurementSummary(photos);
  if (!summary.dw.n && !summary.dl.n && !estimatedSize && !legacySize) return null;
  return <div className="text-sm text-slate-700 space-y-2" aria-label="Photo measurement summary">
    {(summary.dw.n > 0 || summary.dl.n > 0) && <div className="max-w-sm space-y-1">
      <details>
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 [&::-webkit-details-marker]:hidden">
          <span className="font-medium">Measurements</span>
          <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="sr-only">Measurement details</span>
        </summary>
        <div className="space-y-1 pb-2 text-xs">
          <ul className="space-y-1">
            {photos.map((photo, index) => {
              const dw = photoMeasurementMeters(photo).dw;
              return dw === undefined ? null : <li key={index}>
                Photo {index + 1}: {dw.toFixed(2)} m · {isExternal(photo.measure)
                  ? "Externally calculated DW" : "Measured in MantaTracker; DW derived from DL × 2.3"}
              </li>;
            })}
          </ul>
          {summary.dl.n > 0 && <div>Measured DL: <strong>{summary.dl.mean!.toFixed(2)} m</strong> · n = {summary.dl.n}</div>}
          <p>Each contributing photo counts once. Mean and sample SD describe DW measurements of this manta across photographs. SD is unavailable for one measurement. Visual estimates and DL-only values are excluded.</p>
        </div>
      </details>
      {summary.dw.n > 0 && <dl className="grid grid-cols-3 gap-x-4 text-center">
        <div><dt className="flex min-h-6 items-end justify-center text-[10px] leading-3 text-slate-500 sm:min-h-0 sm:text-xs">N</dt><dd className="font-medium">{summary.dw.n}</dd></div>
        <div><dt className="flex min-h-6 items-end justify-center text-[10px] leading-3 text-slate-500 sm:min-h-0 sm:text-xs">Mean DW</dt><dd className="font-medium">{summary.dw.mean!.toFixed(2)} m</dd></div>
        <div><dt className="flex min-h-6 items-end justify-center text-[10px] leading-3 text-slate-500 sm:min-h-0 sm:text-xs">SD</dt><dd className="font-medium">{summary.dw.sd == null ? "—" : `${summary.dw.sd.toFixed(2)} m`}</dd></div>
      </dl>}
    </div>}
    {estimatedSize && <div>Estimated size: {Number(estimatedSize).toFixed(2)} m<span className="block text-xs">Source: contributor visual estimate</span></div>}
    {legacySize && <div>Legacy size: {legacySize} m<span className="block text-xs">Source unspecified — excluded from measured means</span></div>}
  </div>;
}
