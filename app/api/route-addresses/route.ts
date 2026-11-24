import { searchRouteAddresses } from "../../../src/server/routing";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (query.length < 3 || query.length > 160) {
    return Response.json({ error: "Informe um endereço com 3 a 160 caracteres." }, { status: 400 });
  }
  try {
    return Response.json(await searchRouteAddresses(query, request.signal), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "A busca de endereços está indisponível. Tente novamente." }, { status: 503 });
  }
}
