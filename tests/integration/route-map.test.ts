import assert from "node:assert/strict";
import { it } from "vitest";
import { GET } from "../../app/api/route-map/route";
import { prepareRouteFile } from "../../src/lib/route-export";

it("tenta outro provedor após um 503 e recorta as ruas para o mapa offline", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const bbox = "-8.149,-35.008,-8.141,-34.990";
  globalThis.fetch = async (input, init) => {
    requests.push(String(input));
    assert.equal(init?.method, "POST");
    assert.ok(init.body instanceof URLSearchParams);
    assert.ok(init.body.get("data")?.includes("out geom(-8.14900,-35.00800,-8.14100,-34.99000)"));
    if (requests.length === 1) return new Response(null, { status: 503 });
    return Response.json({ elements: [{ geometry: [
      { lat: -8.145, lon: -35.005 }, { lat: -8.146, lon: -35.001 }, null,
      { lat: -8.146, lon: -34.999 }, { lat: -8.145, lon: -34.997 },
    ] }] });
  };
  try {
    const url = "https://alerta.example/api/route-map?bbox=";
    assert.equal((await GET(new Request(url + "0,0,1,1"))).status, 400);
    assert.equal(requests.length, 0);
    const result = await GET(new Request(url + bbox));
    assert.equal(result.status, 200);
    assert.equal(new Set(requests).size, 2);
    assert.deepEqual(await result.json(), [
      [{ lat: -8.145, lng: -35.005 }, { lat: -8.146, lng: -35.001 }],
      [{ lat: -8.146, lng: -34.999 }, { lat: -8.145, lng: -34.997 }],
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

it("gera o HTML com a rota e o limite municipal mesmo quando os provedores falham", async () => {
  const originalFetch = globalThis.fetch;
  const origin = { lat: -8.145, lng: -35.005, label: "Origem" };
  const destination = { lat: -8.145, lng: -34.993, label: "Destino" };
  const route = { origin, destination, path: [origin, destination], distance: 1200, duration: 360, nearbyIncidents: 0 };
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("/api/route-map")) {
      return GET(new Request("https://alerta.example" + input, init));
    }
    return new Response(null, { status: 503 });
  };
  try {
    const { file, hasStreets } = await prepareRouteFile(route, "Bicicleta");
    assert.equal(hasStreets, false);
    assert.equal(file.type, "text/html");
    const html = await file.text();
    assert.match(html, /<polyline points="/);
    assert.match(html, /<polygon points="/);
    assert.match(html, /Ruas indisponíveis na exportação/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
