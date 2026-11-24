import { incidentStore, parseIncidentChange, parseIncidentReplacement } from "../../../../src/server/incident-store";
import { incidentViewerSession, readIncidentViewer } from "../../../../src/server/incident-viewer";
import type { IncidentChange } from "../../../../src/lib/incidents";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const session = incidentViewerSession(request);
  const thread = await incidentStore.thread(id, session.viewer);
  return session.setCookie(thread ? Response.json(thread) :
    Response.json({ error: "Ocorrência indisponível." }, { status: 404 }));
}

async function mutate(request: Request, { params }: Context, readChange: () => Promise<IncidentChange | null>) {
  const viewer = readIncidentViewer(request);
  const requestSite = request.headers.get("sec-fetch-site");
  if (!viewer || requestSite === "cross-site" || requestSite === "same-site") {
    return Response.json({ error: "Abra o mapa neste navegador para continuar." }, { status: 403 });
  }
  const change = await readChange();
  if (!change) return Response.json({ error: "Confira os dados e tente novamente." }, { status: 400 });
  const { id } = await params;
  const result = await incidentStore.change(id, viewer, change);
  if (result === "missing") return Response.json({ error: "Ocorrência indisponível." }, { status: 404 });
  if (result === "forbidden") return Response.json({ error: "Você não pode fazer essa alteração." }, { status: 403 });
  const headers = { "Cache-Control": "private, no-store" };
  return result === null ? new Response(null, { status: 204, headers }) : Response.json(result, { headers });
}

export function PATCH(request: Request, context: Context) {
  return mutate(request, context, async () => parseIncidentChange(await request.json().catch(() => null)));
}

export function PUT(request: Request, context: Context) {
  return mutate(request, context, async () => parseIncidentReplacement(await request.json().catch(() => null)));
}

export function DELETE(request: Request, context: Context) {
  return mutate(request, context, async () => ({ action: "delete" }));
}
