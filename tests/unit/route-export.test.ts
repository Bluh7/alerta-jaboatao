import assert from "node:assert/strict";
import { it } from "vitest";
import { renderRouteFile } from "../../src/lib/route-export";

const origin = { lat: -8.14, lng: -35.005, label: "Rua A & B" };
const destination = { lat: -8.14, lng: -34.993, label: "<script>alert(1)</script>" };
const roads = [[{ lat: -8.139, lng: -35.005 }, { lat: -8.139, lng: -34.993 }]];

it("gera um documento autônomo com o traçado escolhido e protege os nomes dos endereços", () => {
  const path = [origin, { lat: -8.143, lng: -35 }, destination];
  const html = renderRouteFile({ origin, destination, path, duration: 360, distance: 1200, nearbyIncidents: 2 }, "Bicicleta", roads);

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<polyline points="(?:[\d.]+,[\d.]+ ){2}[\d.]+,[\d.]+"/);
  assert.match(html, /<g id="ruas"[^>]*>\s*<polyline points="/);
  assert.match(html, /Rua A &amp; B/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /Bicicleta · 6 min · 1,2 km/);
  assert.match(html, /150 m do trajeto: 2/);
  assert.doesNotMatch(html, /<script|\s(?:src|href)=|https?:\/\//);
  assert.notEqual(html, renderRouteFile({
    origin, destination, path: [origin, destination], duration: 360, distance: 1200, nearbyIncidents: 2,
  }, "Bicicleta", roads));
});
