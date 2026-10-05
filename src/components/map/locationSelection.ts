export type LocationPoint = { lat: number; lon: number };

export function locationPoint(lat: unknown, lon: unknown): LocationPoint | null {
  if (lat == null || lon == null || String(lat).trim() === "" || String(lon).trim() === "") return null;
  const latitude = Number(lat), longitude = Number(lon);
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    ? { lat: latitude, lon: longitude } : null;
}

export function initialLocationPoint(
  lat: unknown, lon: unknown,
  defaults?: { latitude?: number | null; longitude?: number | null },
): LocationPoint | null {
  return locationPoint(lat, lon) ?? locationPoint(defaults?.latitude, defaults?.longitude);
}

export function formatLocationPoint(point: LocationPoint) {
  return { lat: point.lat.toFixed(5), lng: point.lon.toFixed(5) };
}

export type LocationStart = {
  point: LocationPoint | null;
  locationId: string;
  locationName: string;
  coordSource: string;
};

export function locationChanged(start: LocationPoint | null, point: LocationPoint): boolean {
  if (!start) return true;
  const before = formatLocationPoint(start), after = formatLocationPoint(point);
  return before.lat !== after.lat || before.lng !== after.lng;
}

export function mapLocationNames(start: LocationStart, point: LocationPoint) {
  return locationChanged(start.point, point)
    ? { locationId: "", locationName: "" }
    : { locationId: start.locationId, locationName: start.locationName };
}
