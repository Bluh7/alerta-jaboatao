import type { Location } from "./territory";

export type RouteAddress = Location & { label: string };
export type RoadRoute = {
  path: Location[];
  distance: number;
  duration: number;
};
export type RouteOption = RoadRoute & { nearbyIncidents: number };
export type RouteResult = RouteOption & { comparedRoutes: number; options: RouteOption[] };
export type Trip = { origin: RouteAddress; destination: RouteAddress };
export type TripPreview = RouteOption & Trip;
export const travelModes = ["car", "foot", "bike"] as const;
export type TravelMode = typeof travelModes[number];

export function isTravelMode(value: unknown): value is TravelMode {
  return travelModes.some(mode => mode === value);
}

export const incidentRadiusMeters = 150;
