import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { Incident } from "../../src/lib/incidents";
import type { RoadRoute } from "../../src/lib/trip";
import { detourWaypoints, rankRoutes } from "../../src/server/route-ranking";

const origin = { lat: -8.145, lng: -35.005 };
const destination = { lat: -8.145, lng: -34.993 };
const direct: RoadRoute = { path: [origin, destination], distance: 1300, duration: 240 };
const detour: RoadRoute = {
  path: [origin, { lat: -8.15, lng: origin.lng }, { lat: -8.15, lng: destination.lng }, destination],
  distance: 2200,
  duration: 400,
};
const incident: Incident = {
  id: "incident", category: "robbery", description: "", lat: origin.lat, lng: -34.999,
  createdAt: "2026-11-20T12:00:00.000Z",
};

describe("rankRoutes", () => {
  it("detecta ocorrências próximas a um segmento mesmo entre dois pontos afastados", () => {
    const [best, other] = rankRoutes([direct, detour], [incident], Date.parse(incident.createdAt));
    assert.equal(best.route, detour);
    assert.equal(best.nearbyIncidents, 0);
    assert.equal(other.route, direct);
    assert.equal(other.nearbyIncidents, 1);
  });

  it("escolhe o menor tempo quando as rotas têm a mesma exposição", () => {
    assert.equal(rankRoutes([detour, direct], [])[0].route, direct);
  });

  it("propõe pontos antes e depois da ocorrência em cada lado do trajeto", () => {
    const [{ encounters }] = rankRoutes([direct], [incident]);
    const north = detourWaypoints(encounters, origin, destination, 1, 270);
    const south = detourWaypoints(encounters, origin, destination, -1, 270);
    assert.equal(north.length, 2);
    assert.equal(south.length, 2);
    assert.ok(north.every(point => point.lat > incident.lat));
    assert.ok(south.every(point => point.lat < incident.lat));
    assert.ok(north[0].lng < incident.lng);
    assert.ok(north[1].lng > incident.lng);
  });

  it("não força um desvio de uma ocorrência já próxima da origem", () => {
    const [{ encounters }] = rankRoutes([direct], [{ ...incident, ...origin }]);
    assert.deepEqual(detourWaypoints(encounters, origin, destination, 1, 270), []);
  });

  it("conta a ocorrência uma única vez quando o trajeto passa por ela novamente", () => {
    const route = { ...direct, path: [origin, destination, origin] };
    assert.equal(rankRoutes([route], [incident])[0].nearbyIncidents, 1);
  });
});
