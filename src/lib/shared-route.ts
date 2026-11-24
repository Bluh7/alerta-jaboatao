import { isInJaboatao, type Location } from "./territory";
import { isTravelMode, type TravelMode, type TripPreview } from "./trip";

export const sharedRoutePrefix = "#rota=";

function isPoint(value: unknown): value is Location {
  if (!value || typeof value !== "object") return false;
  const { lat, lng } = value as Partial<Location>;
  return typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90 &&
    typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180;
}

export function routeShareUrl(url: string, route: TripPreview, mode: TravelMode) {
  let lastLat = 0;
  let lastLng = 0;
  const path = route.path.map(point => {
    const lat = Math.round(point.lat * 100_000);
    const lng = Math.round(point.lng * 100_000);
    const delta = [lat - lastLat, lng - lastLng];
    lastLat = lat;
    lastLng = lng;
    return delta;
  });
  const payload = JSON.stringify({ ...route, mode, path });
  const bytes = new TextEncoder().encode(payload);
  const target = new URL(url);
  target.hash = sharedRoutePrefix + btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return target.href;
}

export function readSharedRoute(hash: string): { route: TripPreview; mode: TravelMode } | null {
  if (!hash.startsWith(sharedRoutePrefix) || hash.length > 700_000) return null;
  try {
    const encoded = hash.slice(sharedRoutePrefix.length).replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    const { origin, destination, distance, duration, nearbyIncidents, path, mode } = JSON.parse(new TextDecoder().decode(bytes));
    if (!isPoint(origin) || !isInJaboatao(origin) || !isPoint(destination) || !isInJaboatao(destination) ||
        !("label" in origin) || typeof origin.label !== "string" || origin.label.length > 500 ||
        !("label" in destination) || typeof destination.label !== "string" || destination.label.length > 500 ||
        !Number.isFinite(distance) || distance <= 0 || !Number.isFinite(duration) || duration <= 0 ||
        !Number.isSafeInteger(nearbyIncidents) || nearbyIncidents < 0 || !isTravelMode(mode) ||
        !Array.isArray(path) || path.length < 2 || path.length > 50_000) return null;

    let lat = 0;
    let lng = 0;
    const points: Location[] = [];
    for (const delta of path) {
      if (!Array.isArray(delta) || delta.length !== 2 || !delta.every(Number.isSafeInteger)) return null;
      lat += delta[0];
      lng += delta[1];
      const point = { lat: lat / 100_000, lng: lng / 100_000 };
      if (!isPoint(point)) return null;
      points.push(point);
    }
    return { route: { origin: { ...origin, label: origin.label }, destination: { ...destination, label: destination.label },
      distance, duration, nearbyIncidents, path: points }, mode };
  } catch {
    return null;
  }
}
