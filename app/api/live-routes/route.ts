import { readSharedRoute } from "../../../src/lib/shared-route";
import { isValidLocation } from "../../../src/lib/territory";
import { startLiveRoute } from "../../../src/server/live-route-store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (typeof body?.route !== "string" || !readSharedRoute(body.route) ||
      !body.position || !isValidLocation(body.position)) {
    return Response.json({ error: "Informe uma rota e uma localização válidas." }, { status: 400 });
  }
  const { lat, lng } = body.position;
  return Response.json(startLiveRoute(body.route, { lat, lng }), {
    status: 201, headers: { "Cache-Control": "no-store" },
  });
}
