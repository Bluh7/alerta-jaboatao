import { expect, it, vi } from "vitest";
import { POST } from "../../app/api/live-routes/route";
import { DELETE, GET, PATCH } from "../../app/api/live-routes/[id]/route";
import { routeShareUrl } from "../../src/lib/shared-route";
import { incidentStore } from "../../src/server/incident-store";

const origin = { lat: -8.05, lng: -34.9, label: "Minha localização" };
const destination = { lat: -8.145, lng: -34.993, label: "Destino" };
const route = { origin, destination, path: [origin, destination], distance: 12000, duration: 900, nearbyIncidents: 0 };
const position = { lat: origin.lat, lng: origin.lng };
const url = "https://alerta.example/api/live-routes";
const hash = (trip = route) => new URL(routeShareUrl(url, trip, "car")).hash;
const start = (data: object) => POST(new Request(url, { method: "POST", body: JSON.stringify(data) }));

async function session() {
  const response = await start({ route: hash(), position });
  expect(response.status).toBe(201);
  const { id, secret } = await response.json();
  const context = { params: Promise.resolve({ id }) };
  const address = `${url}/${id}`;
  const access = { "X-Live-Secret": secret };
  return { address, access, context };
}

it("publica a rota e posição sem expor a credencial e exige a credencial para alterar ou encerrar", async () => {
  const { address, access, context } = await session();
  const updated = { ...position, lat: -8.06 };
  const patch = (headers?: HeadersInit) => new Request(address, {
    method: "PATCH", headers, body: JSON.stringify(updated),
  });
  const current = await GET(new Request(address + "?route=1"), context);
  expect(current.headers.get("Cache-Control")).toBe("no-store");
  expect(await current.json()).toEqual({ route: hash(), position });
  expect((await PATCH(patch(), context)).status).toBe(404);
  expect((await DELETE(new Request(address, { method: "DELETE" }), context)).status).toBe(404);
  expect((await PATCH(patch(access), context)).status).toBe(204);
  expect(await (await GET(new Request(address), context)).json()).toEqual({ position: updated });
  expect((await DELETE(new Request(address, { method: "DELETE", headers: access }), context)).status).toBe(204);
  expect((await GET(new Request(address), context)).status).toBe(404);
});

it("expira a rota sem novas posições e rejeita sessões sem posição ou com destino externo", async () => {
  vi.useFakeTimers();
  try {
    expect((await start({ route: hash() })).status).toBe(400);
    expect((await start({ route: hash({ ...route, destination: origin }), position })).status).toBe(400);
    const { address, context } = await session();
    vi.advanceTimersByTime(45_000);
    expect((await GET(new Request(address), context)).status).toBe(404);
  } finally {
    vi.useRealTimers();
  }
});

it("mostra ocorrências próximas ao traçado mesmo longe da posição transmitida", async () => {
  const { address, context, access } = await session();
  const marker = { category: "noise", description: "" } as const;
  const near = await incidentStore.create({ ...marker, lat: destination.lat, lng: destination.lng }, "owner");
  const far = await incidentStore.create({ ...marker, lat: -8.145, lng: -35.005 }, "owner");
  try {
    const request = () => GET(new Request(address + "?incidents=1"), context);
    const result = await (await request()).json();
    expect(result.incidents.map((item: { id: string }) => item.id)).toEqual([near.id]);
    await incidentStore.change(near.id, "owner", { action: "delete" });
    expect((await (await request()).json()).incidents).toEqual([]);
  } finally {
    await incidentStore.change(near.id, "owner", { action: "delete" });
    await incidentStore.change(far.id, "owner", { action: "delete" });
    await DELETE(new Request(address, { method: "DELETE", headers: access }), context);
  }
});
