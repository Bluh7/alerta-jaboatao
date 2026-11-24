import { isValidLocation } from "../../../../src/lib/territory";
import { readSharedRoute } from "../../../../src/lib/shared-route";
import type { Incident } from "../../../../src/lib/incidents";
import { incidentStore } from "../../../../src/server/incident-store";
import { readIncidentViewer } from "../../../../src/server/incident-viewer";
import { rankRoutes } from "../../../../src/server/route-ranking";
import { endLiveRoute, getLiveRoute, updateLiveRoute } from "../../../../src/server/live-route-store";

type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "no-store" };

function unavailable() {
  return Response.json({ error: "Compartilhamento ao vivo indisponível." }, { status: 404, headers });
}

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const session = getLiveRoute(id);
  if (!session) return unavailable();
  const query = new URL(request.url).searchParams;
  let incidents: Incident[] | undefined;
  if (query.get("incidents") === "1") {
    const shared = readSharedRoute(session.route);
    if (!shared) return unavailable();
    const visible = await incidentStore.list(readIncidentViewer(request));
    const [ranked] = rankRoutes([shared.route], visible);
    const nearby = new Set(ranked.encounters.map(({ incident }) => incident.id));
    incidents = visible.filter(incident => nearby.has(incident.id));
  }
  return Response.json({ position: session.position, route: query.get("route") === "1" ? session.route : undefined, incidents }, { headers });
}

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const position = await request.json().catch(() => null);
  if (!position || !isValidLocation(position)) {
    return Response.json({ error: "Informe uma localização válida." }, { status: 400, headers });
  }
  return updateLiveRoute(id, request.headers.get("X-Live-Secret"), { lat: position.lat, lng: position.lng })
    ? new Response(null, { status: 204, headers }) : unavailable();
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  return endLiveRoute(id, request.headers.get("X-Live-Secret"))
    ? new Response(null, { status: 204, headers }) : unavailable();
}
