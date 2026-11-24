import type { Incident } from "../lib/incidents";
import { incidentRadiusMeters, type RoadRoute } from "../lib/trip";
import { isInJaboatao, type Location } from "../lib/territory";

const dayMs = 86_400_000;
const metersPerDegree = 111_195;

type Encounter = {
  incident: Incident;
  progress: number;
  east: number;
  north: number;
  longitudeFactor: number;
  score: number;
};

export function rankRoutes(routes: RoadRoute[], incidents: Incident[], now = Date.now()) {
  const radiusSquared = incidentRadiusMeters ** 2;
  const weightedIncidents = incidents.map(incident => ({
    ...incident,
    longitudeFactor: metersPerDegree * Math.cos(incident.lat * Math.PI / 180),
    weight: 0.25 + 0.75 * 2 ** (-Math.max(0, now - Date.parse(incident.createdAt)) / dayMs),
  }));

  return routes.map(route => {
    let score = 0;
    const encounters: Encounter[] = [];
    for (const incident of weightedIncidents) {
      let closest = radiusSquared;
      let progress = 0;
      let east = 0;
      let north = 0;
      for (let i = 1; i < route.path.length; i++) {
        const start = route.path[i - 1];
        const end = route.path[i];
        const x = (start.lng - incident.lng) * incident.longitudeFactor;
        const y = (start.lat - incident.lat) * metersPerDegree;
        const dx = (end.lng - start.lng) * incident.longitudeFactor;
        const dy = (end.lat - start.lat) * metersPerDegree;
        const lengthSquared = dx * dx + dy * dy;
        const position = lengthSquared ? Math.min(1, Math.max(0, -(x * dx + y * dy) / lengthSquared)) : 0;
        const distance = (x + position * dx) ** 2 + (y + position * dy) ** 2;
        if (distance < closest || (distance === closest && !east && !north && lengthSquared)) {
          closest = distance;
          progress = i - 1 + position;
          const length = Math.sqrt(lengthSquared);
          east = length ? dx / length : 0;
          north = length ? dy / length : 0;
        }
      }
      if (closest < radiusSquared) {
        const proximity = 1 - Math.sqrt(closest) / incidentRadiusMeters;
        const exposure = (0.5 + proximity) * incident.weight;
        score += exposure;
        encounters.push({ incident, progress, east, north, longitudeFactor: incident.longitudeFactor, score: exposure });
      }
    }
    return { route, nearbyIncidents: encounters.length, encounters, score };
  }).sort((a, b) => a.nearbyIncidents - b.nearbyIncidents || a.score - b.score || a.route.duration - b.route.duration);
}

function distanceTo(point: Location, encounter: Encounter) {
  return Math.hypot(
    (point.lng - encounter.incident.lng) * encounter.longitudeFactor,
    (point.lat - encounter.incident.lat) * metersPerDegree,
  );
}

export function detourWaypoints(encounters: Encounter[], origin: Location, destination: Location, side: 1 | -1, offset: number) {
  const candidates = encounters.filter(encounter => (encounter.east || encounter.north) &&
    distanceTo(origin, encounter) >= incidentRadiusMeters &&
    distanceTo(destination, encounter) >= incidentRadiusMeters)
    .sort((a, b) => b.score - a.score);
  const selected: Encounter[] = [];
  for (const encounter of candidates) {
    if (selected.some(item => distanceTo(item.incident, encounter) < 2 * offset)) continue;
    selected.push(encounter);
    if (selected.length === 2) break;
  }

  return selected.sort((a, b) => a.progress - b.progress).flatMap(encounter => {
    const along = incidentRadiusMeters + 40;
    const offsets = [
      ...(distanceTo(origin, encounter) > along ? [-along] : []),
      ...(distanceTo(destination, encounter) > along ? [along] : []),
    ];
    return (offsets.length ? offsets : [0]).map(forward => ({
      lat: encounter.incident.lat + (forward * encounter.north + side * offset * encounter.east) / metersPerDegree,
      lng: encounter.incident.lng + (forward * encounter.east - side * offset * encounter.north) / encounter.longitudeFactor,
    })).filter(isInJaboatao);
  });
}
