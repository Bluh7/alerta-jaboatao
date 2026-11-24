import { incidentStore, parseIncident } from "../../../src/server/incident-store";
import { resolveIncidentLocation } from "../../../src/server/incident-location";
import { incidentDay } from "../../../src/lib/incidents";
import { incidentViewerSession } from "../../../src/server/incident-viewer";

export async function GET(request: Request) {
  const session = incidentViewerSession(request);
  const incidents = await incidentStore.list(session.viewer);
  if (new URL(request.url).searchParams.get("diary") === "1") {
    const today = incidentDay.format(new Date());
    await Promise.all(incidents.map(async incident => {
      if (incidentDay.format(new Date(incident.createdAt)) === today) {
        incident.locationLabel = await resolveIncidentLocation(incident);
      }
    }));
  }
  return session.setCookie(Response.json(incidents));
}

export async function POST(request: Request) {
  const input = parseIncident(await request.json().catch(() => null));
  if (!input) return Response.json({ error: "Informe uma categoria e um ponto dentro de Jaboatão. A descrição pode ter até 280 caracteres." }, { status: 400 });
  const session = incidentViewerSession(request);
  return session.setCookie(Response.json(await incidentStore.create(input, session.viewer), { status: 201 }));
}
