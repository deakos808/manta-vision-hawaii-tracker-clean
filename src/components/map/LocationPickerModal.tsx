import React, { useCallback, useRef, useState } from "react";
import TempSightingMap from "./TempSightingMap";
import { formatLocationPoint, locationPoint, locationChanged, mapLocationNames, type LocationPoint, type LocationStart } from "./locationSelection";

type Props = {
  initialPoint: LocationPoint | null;
  initialLocation: Omit<LocationStart, "point">;
  onCancel: () => void;
  onSave: (point: LocationPoint, names: { locationId: string; locationName: string }) => void;
};

export default function LocationPickerModal({ initialPoint, initialLocation, onCancel, onSave }: Props) {
  // Snapshot the starting location once. Map movement edits only this mounted draft.
  const start = useRef({ ...initialLocation, point: initialPoint }).current;
  const [confirming, setConfirming] = useState(false);
  const [selected, setSelected] = useState(initialPoint);
  const pick = useCallback((lat: number, lon: number) => {
    const point = locationPoint(lat, lon);
    if (point) setSelected(point);
  }, []);
  const formatted = selected ? formatLocationPoint(selected) : null;

  const commit = () => { if (selected) onSave(selected, mapLocationNames(start, selected)); };
  const namedLocation = start.locationName || start.locationId;

  return (
    <div className="fixed inset-0 z-[300000] bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="location-picker-title"
        className="bg-white w-full max-w-2xl rounded-lg border p-4 relative"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}>
        <button type="button" autoFocus aria-label="Close" className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full border" onClick={onCancel}>&times;</button>
        <div hidden={confirming}>
        <h3 id="location-picker-title" className="text-lg font-medium mb-3">Pick Location</h3>
        <TempSightingMap lat={start.point?.lat} lon={start.point?.lon} onPick={pick} />
        <div className="mt-3 text-sm text-slate-600" aria-live="polite">
          Selected: {formatted ? `${formatted.lat}, ${formatted.lng}` : "Click the map to choose a location"}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="px-3 py-2 rounded border" onClick={onCancel}>Cancel</button>
          <button type="button" className="px-3 py-2 rounded bg-sky-600 text-white disabled:opacity-50"
            disabled={!selected} onClick={() => { if (selected && locationChanged(start.point, selected)) setConfirming(true); else commit(); }}>Save Location</button>
        </div>
        </div>
        {confirming && (
          <div>
            <h3 className="text-lg font-medium mb-3">Save changed location?</h3>
            <p className="text-sm text-slate-600">
              {namedLocation
                ? <>You moved the pin from the saved location for: <strong>{namedLocation}</strong>. This sighting will be saved as Custom at:</>
                : "Save this sighting location at:"}
            </p>
            <p className="my-3 font-mono text-sm">{formatted?.lat}, {formatted?.lng}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="px-3 py-2 rounded border" onClick={() => setConfirming(false)}>Keep Editing</button>
              <button type="button" className="px-3 py-2 rounded bg-sky-600 text-white" onClick={commit}>
                {namedLocation ? "Save as Custom Location" : "Save Location"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
