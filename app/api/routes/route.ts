import { isInJaboatao, type Location } from "../../../src/lib/territory";
import { incidentStore } from "../../../src/server/incident-store";
import { detourWaypoints, rankRoutes } from "../../../src/server/route-ranking";
import { findRoadRoutes } from "../../../src/server/routing";
import { readIncidentViewer } from "../../../src/server/incident-viewer";
import { isTravelMode } from "../../../src/lib/trip";

function routePoint(value: unknown): Location | null {
  if (!value || typeof value !== "object") return null;
  const { lat, lng } = value as Record<string, unknown>;
  return typeof lat === "number" && typeof lng === "number" && isInJaboatao({ lat, lng }) ? { lat, lng } : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const mode = body?.mode === undefined ? "car" : body.mode;
  if (!isTravelMode(mode)) {
    return Response.json({ error: "Escolha carro, caminhada ou bicicleta." }, { status: 400 });
  }
  const origin = routePoint(body?.origin);
  const destination = routePoint(body?.destination);
  if (!origin || !destination) {
    return Response.json({ error: "Escolha uma origem e um destino em Jaboatão." }, { status: 400 });
  }
  if (origin.lat === destination.lat && origin.lng === destination.lng) {
    return Response.json({ error: "Escolha um destino diferente da origem." }, { status: 400 });
  }

  try {
    const routes = await findRoadRoutes(origin, destination, { mode, signal: request.signal });
    if (!routes) return Response.json({ error: "Aguarde um instante e tente novamente." }, { status: 429 });
    const incidents = await incidentStore.list(readIncidentViewer(request));
    const now = Date.now();
    let [best] = rankRoutes(routes, incidents, now);
    if (!best) return Response.json({ error: "Nenhuma rota encontrada para esse modo de transporte." }, { status: 404 });

    const compared = new Map(routes.map(route => [JSON.stringify(route.path), route]));
    if (best.nearbyIncidents > 0) {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(7000)]);
      const attempts = [[1, 270], [-1, 270], [1, 410], [-1, 410]] as const;
      const tried = new Set<string>();
      for (const [side, offset] of attempts) {
        if (signal.aborted || best.nearbyIncidents === 0) break;
        const waypoints = detourWaypoints(best.encounters, origin, destination, side, offset);
        const key = JSON.stringify(waypoints);
        if (!waypoints.length || tried.has(key)) continue;
        tried.add(key);
        const detours = await findRoadRoutes(origin, destination, { mode, waypoints, signal }).catch(() => null);
        const newRoutes = (detours ?? []).filter(route => {
          const shape = JSON.stringify(route.path);
          if (compared.has(shape)) return false;
          compared.set(shape, route);
          return true;
        });
        if (newRoutes.length) [best] = rankRoutes([best.route, ...newRoutes], incidents, now);
      }
    }
    const options = rankRoutes([...compared.values()], incidents, now)
      .map(({ route, nearbyIncidents }) => ({ ...route, nearbyIncidents }));
    return Response.json({ ...options[0], comparedRoutes: options.length, options });
  } catch {
    return Response.json({ error: "O serviço de rotas está indisponível. Tente novamente." }, { status: 503 });
  }
}
