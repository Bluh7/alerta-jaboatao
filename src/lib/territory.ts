import boundary from "../data/jaboatao.json";

export type Location = { lat: number; lng: number };
export const territory = boundary.geometry.coordinates[0].map(([lng, lat]) => ({ lat, lng }));
export const cityCenter: Location = { lat: -8.145, lng: -35.005 };

export function isInJaboatao({lat, lng}: Location) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  let inside = false;
  for (let i = 1; i < territory.length; i++) {
    const a = territory[i - 1];
    const b = territory[i];
    const cross = (lng - a.lng) * (b.lat - a.lat) - (lat - a.lat) * (b.lng - a.lng);
    if (Math.abs(cross) < 1e-12 &&
        lng >= Math.min(a.lng, b.lng) && lng <= Math.max(a.lng, b.lng) &&
        lat >= Math.min(a.lat, b.lat) && lat <= Math.max(a.lat, b.lat)) return true;
    if ((a.lat > lat) !== (b.lat > lat) &&
        lng < (b.lng - a.lng) * (lat - a.lat) / (b.lat - a.lat) + a.lng) {
      inside = !inside;
    }
  }
  return inside;
}
