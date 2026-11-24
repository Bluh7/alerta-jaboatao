import { territory, type Location } from "../../../src/lib/territory";

const limit = {
  south: Math.min(...territory.map(point => point.lat)) - 0.15,
  north: Math.max(...territory.map(point => point.lat)) + 0.15,
  west: Math.min(...territory.map(point => point.lng)) - 0.15,
  east: Math.max(...territory.map(point => point.lng)) + 0.15,
};

const providers = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

type OverpassData = { elements?: { geometry?: ({ lat: number; lon: number } | null)[] }[] };

function streetPaths(data: OverpassData): Location[][] {
  const paths: Location[][] = [];
  for (const element of Array.isArray(data?.elements) ? data.elements : []) {
    if (!Array.isArray(element?.geometry)) continue;
    let segment: Location[] = [];
    for (const point of [...element.geometry, null]) {
      if (point && Number.isFinite(point.lat) && Number.isFinite(point.lon)) {
        segment.push({ lat: point.lat, lng: point.lon });
      } else {
        if (segment.length > 1) paths.push(segment);
        segment = [];
      }
    }
  }
  return paths;
}

export async function GET(request: Request) {
  const bbox = new URL(request.url).searchParams.get("bbox")?.split(",").map(Number);
  if (!bbox || bbox.length !== 4 || !bbox.every(Number.isFinite)) return Response.json(null, { status: 400 });
  const [south, west, north, east] = bbox;
  if (south < limit.south || west < limit.west || north > limit.north || east > limit.east ||
      north <= south || east <= west) return Response.json(null, { status: 400 });

  const bounds = bbox.map(value => value.toFixed(5)).join(",");
  const roads = (north - south) * (east - west) > 0.007
    ? "motorway|trunk|primary|secondary|tertiary|residential|unclassified"
    : "motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service|cycleway|footway|pedestrian";
  const query = `[out:json][timeout:7];way["highway"~"^(${roads})(_link)?$"](${bounds});out geom(${bounds});`;
  const endpoints = new Set([process.env.OVERPASS_URL || providers[0], ...providers]);
  const deadline = AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]);
  for (const endpoint of endpoints) {
    if (deadline.aborted) break;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "User-Agent": "Alerta-Jaboatao" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.any([deadline, AbortSignal.timeout(8_000)]),
        next: { revalidate: 3600 },
      });
      if (!response.ok) continue;
      const paths = streetPaths(await response.json());
      if (paths.length > 0) return Response.json(paths);
    } catch {
      // Try the next provider when transport or response parsing fails.
    }
  }
  return Response.json([], { headers: { "Cache-Control": "no-store" } });
}
