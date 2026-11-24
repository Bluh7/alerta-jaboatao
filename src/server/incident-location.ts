import type { Location } from "../lib/territory";

const cache = new Map<string, { expires: number; result: Promise<string | undefined> }>();
let inFlight = 0;

function labelFromPhoton(properties?: Record<string, unknown>) {
  if (!properties) return;
  const text = (key: string) => typeof properties[key] === "string" ? properties[key].trim() : "";
  const street = text("street") || (text("type") === "street" || text("osm_key") === "highway" ? text("name") : "");
  const area = text("locality") || text("district");
  const reference = street || text("name") || area;
  if (reference) return [reference, area !== reference ? area : ""].filter(Boolean).join(" · ");
}

export function resolveIncidentLocation({ lat, lng }: Location) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expires > now) return cached.result;
  if (inFlight >= 4) return;

  for (const [id, item] of cache) {
    if (item.expires <= now) cache.delete(id);
  }
  const entry = {
    expires: Infinity,
    result: lookup().then(label => {
      entry.expires = Date.now() + (label ? 86_400_000 : 60_000);
      return label;
    }),
  };
  cache.set(key, entry);
  return entry.result;

  async function lookup() {
    inFlight++;
    let label: string | undefined;
    try {
      const url = new URL("/reverse", process.env.PHOTON_URL || "https://photon.komoot.io");
      url.search = new URLSearchParams({
        lat: String(lat), lon: String(lng), radius: "0.4", limit: "5",
      }).toString();
      const response = await fetch(url, {
        headers: { "Accept-Language": "pt-BR", "User-Agent": "Alerta-Jaboatao" },
        signal: AbortSignal.timeout(2500),
      });
      if (response.ok) {
        const { features } = await response.json() as { features?: { properties?: Record<string, unknown> }[] };
        const properties = features?.map(item => item.properties);
        const street = properties?.find(item => item?.street || item?.type === "street" || item?.osm_key === "highway");
        label = labelFromPhoton(street) || properties?.map(labelFromPhoton).find(Boolean);
      }
    } catch {
      // The incident stays available when the geocoder times out.
    } finally {
      inFlight--;
    }
    return label;
  }
}
