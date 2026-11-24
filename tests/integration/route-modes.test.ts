import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it } from "vitest";
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

it("mostra os modos somente na comparação e indica qual está selecionado", () => {
  const planner = renderToStaticMarkup(createElement(RoutePlanner, { open: true, onClose() {}, onResult() {} }));
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
    assert.doesNotMatch(html, /Copiar link|Baixar mapa offline/);
  }
  const confirmed = renderToStaticMarkup(createElement(RouteSummary, {
    ...props, mode: "bike", comparing: false, count: 1,
    preview: { ...trip, path: [trip.origin, trip.destination], duration: 360, distance: 1200, nearbyIncidents: 0 },
  }));
  assert.match(confirmed, /Comparar rotas/);
  assert.match(confirmed, /Copiar link/);
  assert.match(confirmed, /Baixar mapa offline/);
  assert.match(confirmed, /6 min/);
  assert.doesNotMatch(confirmed, /Modo de transporte/);
});
