import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it, vi } from "vitest";
import { POST } from "../../app/api/routes/route";
import { RoutePlanner } from "../../src/components/route-planner";
import { RouteSummary } from "../../src/components/route-summary";
import type { RouteResult } from "../../src/lib/trip";
import { incidentStore } from "../../src/server/incident-store";

const trip = {
  origin: { lat: -8.145, lng: -35.005, label: "Origem" },
  destination: { lat: -8.145, lng: -34.993, label: "Destino" },
};

function request(mode?: string) {
  return new Request("https://alerta.example/api/routes", {
    method: "POST", body: JSON.stringify({ ...trip, mode }),
  });
}

it("troca o servidor e o tempo por modo e preserva o perfil nas tentativas de desvio", async () => {
  const originalFetch = globalThis.fetch;
  const profiles = [
    { mode: undefined, key: "OSRM_URL", path: "car", duration: 180 },
    { mode: "foot", key: "OSRM_FOOT_URL", path: "foot", duration: 960 },
    { mode: "bike", key: "OSRM_BIKE_URL", path: "bike", duration: 360 },
  ] as const;
  const originalUrls = profiles.map(({ key }) => process.env[key]);
  const incident = await incidentStore.create({ lat: -8.145, lng: -34.999, category: "noise", description: "" }, "author");
  const requests: URL[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    requests.push(url);
    const detour = url.searchParams.get("alternatives") === "false";
    const profile = profiles.find(({ path }) => url.pathname.startsWith("/" + path + "/"));
    assert.ok(profile);
    return Response.json({
      code: "Ok",
      routes: [{ distance: 1500, duration: profile.duration, geometry: {
        coordinates: [[-35.005, -8.145], [-35.002, detour ? -8.148 : -8.145], [-34.996, detour ? -8.148 : -8.145], [-34.993, -8.145]],
      } }],
    });
  };
  try {
    for (const profile of profiles) process.env[profile.key] = "https://routing.test/" + profile.path;
    assert.equal((await POST(request("train"))).status, 400);
    assert.equal(requests.length, 0);
    for (const { mode, path, duration } of profiles) {
      requests.length = 0;
      const response = await POST(request(mode));
      assert.equal(response.status, 200);
      const result: RouteResult = await response.json();
      assert.equal(result.duration, duration);
      assert.equal(result.nearbyIncidents, 0);
      assert.deepEqual(result.options.map(option => option.nearbyIncidents), [0, 1]);
      assert.equal(requests.length, 2);
      assert.ok(requests.every(url => url.pathname.startsWith(`/${path}/route/v1/`)));
      assert.equal(requests[1].searchParams.get("alternatives"), "false");
    }
  } finally {
    globalThis.fetch = originalFetch;
    profiles.forEach(({ key }, index) => {
      const value = originalUrls[index];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    await incidentStore.change(incident.id, "author", { action: "delete" });
  }
});

it("usa a localização como origem padrão e mantém a busca manual sem posição válida", () => {
  const props = { open: true, onClose() {}, onResult() {} };
  const nearby = renderToStaticMarkup(createElement(RoutePlanner, { ...props, position: trip.origin }));
  assert.match(nearby, /type="checkbox"[^>]*checked=""/);
  assert.match(nearby, /Usar minha localização como origem/);
  assert.doesNotMatch(nearby, /id="route-origin"/);
  assert.match(nearby, /id="route-destination"/);

  for (const position of [null, { lat: 91, lng: -34.9 }]) {
    const manual = renderToStaticMarkup(createElement(RoutePlanner, { ...props, position }));
    assert.match(manual, /id="route-origin"/);
    assert.doesNotMatch(manual, /Usar minha localização como origem/);
  }
});

it("aceita uma origem externa em produção e exige um destino dentro do município", async () => {
  const origin = { lat: -8.05, lng: -34.9 };
  const calculate = (start = origin, destination = trip.destination) => POST(new Request("https://alerta.example/api/routes", {
    method: "POST", body: JSON.stringify({ origin: start, destination }),
  }));
  const fetchRoute = vi.fn(async () => Response.json({
    code: "Ok",
    routes: [{ distance: 12000, duration: 900, geometry: {
      coordinates: [[origin.lng, origin.lat], [trip.destination.lng, trip.destination.lat]],
    } }],
  }));
  vi.stubEnv("OSRM_URL", "https://routing.test");
  vi.stubGlobal("fetch", fetchRoute);
  try {
    vi.stubEnv("NODE_ENV", "production");
    const planner = renderToStaticMarkup(createElement(RoutePlanner, {
      open: true, position: origin, onClose() {}, onResult() {},
    }));
    assert.match(planner, /type="checkbox"[^>]*checked=""/);
    assert.equal((await calculate()).status, 200);
    assert.equal((await calculate({ lat: 91, lng: 0 })).status, 400);
    assert.equal((await calculate(origin, { ...origin, label: "Fora do município" })).status, 400);
    assert.equal(fetchRoute.mock.calls.length, 1);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

it("mostra os modos somente na comparação e indica qual está selecionado", () => {
  const planner = renderToStaticMarkup(createElement(RoutePlanner, { open: true, position: null, onClose() {}, onResult() {} }));
  assert.doesNotMatch(planner, /Modo de transporte/);
  const props = {
    trip, preview: null, index: 0, count: 0, error: "", comparing: true,
    onMode() {}, onBrowse() {}, onConfirm() {}, onCompare() {}, onClose() {},
  };
  for (const [mode, label] of [["car", "Carro"], ["foot", "A pé"], ["bike", "Bicicleta"]] as const) {
    const html = renderToStaticMarkup(createElement(RouteSummary, { ...props, mode }));
    assert.match(html, /aria-label="Modo de transporte"/);
    assert.equal([...html.matchAll(/aria-pressed="true"/g)].length, 1);
    assert.match(html, new RegExp(`aria-pressed="true"[^>]*><svg.*?</svg>${label}</button>`));
    assert.doesNotMatch(html, /Escolher esta rota/);
    assert.doesNotMatch(html, /Copiar link|Compartilhar ao vivo/);
  }
  const confirmed = renderToStaticMarkup(createElement(RouteSummary, {
    ...props, mode: "bike", comparing: false, count: 1,
    preview: { ...trip, path: [trip.origin, trip.destination], duration: 360, distance: 1200, nearbyIncidents: 0 },
  }));
  assert.match(confirmed, /Comparar rotas/);
  assert.match(confirmed, /aria-expanded="false" aria-controls="route-summary-options"/);
  assert.match(confirmed, /id="route-summary-options"[^>]* inert=""/);
  assert.match(confirmed, /Copiar link/);
  assert.match(confirmed, /Ative sua localização para compartilhar ao vivo/);
  assert.doesNotMatch(confirmed, /Baixar mapa offline/);
  assert.match(confirmed, /6 min/);
  assert.doesNotMatch(confirmed, /Modo de transporte/);
});
