import { setTimeout as delay } from "node:timers/promises";
import { cityCenter, isInJaboatao, territory, type Location } from "../lib/territory";
import type { RoadRoute, RouteAddress, TravelMode } from "../lib/trip";

const photonBounds = [
  Math.min(...territory.map(point => point.lng)),
  Math.min(...territory.map(point => point.lat)),
  Math.max(...territory.map(point => point.lng)),
  Math.max(...territory.map(point => point.lat)),
].join(",");

const headers = { "Accept-Language": "pt-BR", "User-Agent": "Alerta-Jaboatao" };
let lastPublicRoutingRequest = 0;
const routingOverrides = { car: "OSRM_URL", foot: "OSRM_FOOT_URL", bike: "OSRM_BIKE_URL" } as const;

function coordinates(value: unknown): Location | null {
  if (!Array.isArray(value)) return null;
  const [lng, lat] = value;
  return typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng } : null;
}

export async function searchRouteAddresses(query: string, requestSignal?: AbortSignal): Promise<RouteAddress[]> {
  const url = new URL("/api", process.env.PHOTON_URL || "https://photon.komoot.io");
  url.search = new URLSearchParams({
    q: query, bbox: photonBounds, lat: String(cityCenter.lat), lon: String(cityCenter.lng), limit: "8",
  }).toString();
  const timeout = AbortSignal.timeout(5000);
  const signal = requestSignal ? AbortSignal.any([requestSignal, timeout]) : timeout;
  const response = await fetch(url, { headers, signal, cache: "no-store" });
  if (!response.ok) throw new Error("Address search unavailable");
  const data = await response.json() as { features?: {
    geometry?: { coordinates?: unknown };
    properties?: Record<string, string | undefined>;
  }[] };

  const matches: RouteAddress[] = [];
  for (const feature of data.features ?? []) {
    const point = coordinates(feature.geometry?.coordinates);
    const props = feature.properties ?? {};
    const street = [props.street, props.housenumber].filter(Boolean).join(", ");
    const name = props.name && props.name !== props.street ? props.name : undefined;
    const address = [name, street].filter(Boolean).join(" · ");
    if (!point || !address || !isInJaboatao(point)) continue;
    const area = props.district || props.locality;
    const label = [address, area && area !== address ? area : "Jaboatão dos Guararapes"].join(" · ");
    if (matches.some(match => match.label === label && Math.hypot(match.lat - point.lat, match.lng - point.lng) < 0.001)) continue;
    matches.push({ ...point, label });
  }
  return matches.slice(0, 5);
}

export async function findRoadRoutes(origin: Location, destination: Location, {
  mode = "car", waypoints = [], signal,
}: { mode?: TravelMode; waypoints?: Location[]; signal?: AbortSignal } = {}): Promise<RoadRoute[] | null> {
  const base = process.env[routingOverrides[mode]] || `https://routing.openstreetmap.de/routed-${mode}`;
  const points = [origin, ...waypoints, destination];
  const coordinatesPath = points.map(point => `${point.lng},${point.lat}`).join(";");
  const url = new URL(`${base.replace(/\/$/, "")}/route/v1/driving/${coordinatesPath}`);
  if (url.hostname === "routing.openstreetmap.de") {
    const wait = lastPublicRoutingRequest + 1000 - Date.now();
    if (wait > 0) await delay(wait, undefined, { signal });
    signal?.throwIfAborted();
    const now = Date.now();
    if (now - lastPublicRoutingRequest < 1000) return null;
    lastPublicRoutingRequest = now;
  }
  const radiuses = points.map((_, index) => index === 0 || index === points.length - 1 ? 120 : 90).join(";");
  url.search = new URLSearchParams({
    alternatives: waypoints.length ? "false" : "3",
    overview: "full", geometries: "geojson", generate_hints: "false", radiuses,
  }).toString();
  if (waypoints.length && mode === "car") url.searchParams.set("continue_straight", "true");
  const timeout = AbortSignal.timeout(7000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetch(url, { headers, signal: requestSignal, cache: "no-store" });
  const data = await response.json() as { code?: string; routes?: {
    distance: number; duration: number; geometry?: { coordinates?: unknown[] };
  }[] };
  if (data.code === "NoRoute" || data.code === "NoSegment") return [];
  if (!response.ok || data.code !== "Ok") throw new Error("Routing unavailable");
  return (data.routes ?? []).flatMap(route => {
    const path = route.geometry?.coordinates?.map(coordinates) ?? [];
    if (path.length < 2 || !path.every(point => point !== null) ||
        !Number.isFinite(route.distance) || route.distance <= 0 ||
        !Number.isFinite(route.duration) || route.duration <= 0) return [];
    return [{ path, distance: route.distance, duration: route.duration }];
  });
}
