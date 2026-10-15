import React from "react";
import { measurementSummary, type MeasuredPhoto } from "@/features/photos/photoMeasurements";
export default function MeasurementSummary({ photos, estimatedSize, legacySize }: { photos: MeasuredPhoto[]; estimatedSize?: string | null; legacySize?: string | null }) {
  const summary = measurementSummary(photos);
  if (!summary.dw.n && !summary.dl.n && !estimatedSize && !legacySize) return null;
  return <div className="text-sm text-slate-700 space-y-2" aria-label="Photo measurement summary">
    {(["dw", "dl"] as const).map(metric => summary[metric].n > 0 && <div key={metric}>
      Measured {metric.toUpperCase()}: <strong>{summary[metric].mean!.toFixed(2)} m</strong> · n = {summary[metric].n}
      <span className="block text-xs">Source: photogrammetry</span>
    </div>)}
    {estimatedSize && <div>Estimated size: {Number(estimatedSize).toFixed(2)} m<span className="block text-xs">Source: contributor visual estimate</span></div>}
    {legacySize && <div>Legacy size: {legacySize} m<span className="block text-xs">Source unspecified — excluded from measured means</span></div>}
  </div>;
}
