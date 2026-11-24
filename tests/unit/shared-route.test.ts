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

it("rejeita links inválidos e origem fora do município", () => {
  assert.equal(readSharedRoute("#rota=?"), null);
  const url = routeShareUrl("https://alerta.example/", { ...route, origin: { ...origin, lat: 0 } }, "foot");
  assert.equal(readSharedRoute(new URL(url).hash), null);
});
