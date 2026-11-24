import assert from "node:assert/strict";
import { it } from "vitest";
import { readSharedRoute, routeShareUrl } from "../../src/lib/shared-route";

const origin = { lat: -8.145, lng: -35.005, label: "Praça da Origem" };
const destination = { lat: -8.145, lng: -34.993, label: "Rua do Destino" };
const route = { origin, destination, path: [origin, { lat: -8.148, lng: -35.001 }, destination],
  duration: 360, distance: 1200, nearbyIncidents: 1 };

it("preserva o traçado, os endereços e o modo em um link reabrível", () => {
  const url = new URL(routeShareUrl("https://alerta.example/#anterior", route, "bike"));
  assert.equal(url.origin, "https://alerta.example");
  assert.equal(url.search, "");
  assert.deepEqual(readSharedRoute(url.hash), {
    mode: "bike", route: { ...route, path: route.path.map(({ lat, lng }) => ({ lat, lng })) },
  });
});

it("reabre rotas com origem externa e rejeita links com destino externo", () => {
  assert.equal(readSharedRoute("#rota=?"), null);
  const outside = { ...origin, lat: -8.05, lng: -34.9 };
  const shared = routeShareUrl("https://alerta.example/", { ...route, origin: outside, path: [outside, destination] }, "foot");
  assert.deepEqual(readSharedRoute(new URL(shared).hash)?.route.origin, outside);
  const url = routeShareUrl("https://alerta.example/", { ...route, destination: outside }, "foot");
  assert.equal(readSharedRoute(new URL(url).hash), null);
});
