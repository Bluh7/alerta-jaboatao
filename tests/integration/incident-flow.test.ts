import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { DELETE as remove, GET as thread, PATCH as change, PUT as replace } from "../../app/api/incidents/[id]/route";
import { GET as list, POST as create } from "../../app/api/incidents/route";
import { POST as findRoute } from "../../app/api/routes/route";
import type { Incident, IncidentChange, IncidentThread } from "../../src/lib/incidents";
import type { RouteResult } from "../../src/lib/trip";

function request(path: string, method = "GET", cookie?: string, body?: object) {
  const headers = new Headers();
  if (cookie) headers.set("Cookie", cookie);
  if (body) headers.set("Content-Type", "application/json");
  return new Request("https://alerta.example" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

async function session() {
  const response = await list(request("/api/incidents"));
  const cookie = response.headers.get("Set-Cookie");
  assert.ok(cookie);
  return cookie.split(";")[0];
}

describe("incidentes e rotas", () => {
  it("exige a sessão do autor e rejeita requisições de outra origem em PUT e DELETE", async () => {
    const author = await session();
    const collection = "/api/incidents";
    const created = await create(request(collection, "POST", author, {
      lat: -8.145, lng: -34.999, category: "noise", description: "Original",
    }));
    assert.equal(created.status, 201);
    const incident: Incident = await created.json();
    const path = collection + "/" + incident.id;
    const context = { params: Promise.resolve({ id: incident.id }) };
    const body = { category: "robbery", description: "" };

    try {
      assert.equal((await replace(request(path, "PUT", undefined, body), context)).status, 403);
      assert.equal((await remove(request(path, "DELETE"), context)).status, 403);
      for (const site of ["same-site", "cross-site"]) {
        const put = request(path, "PUT", author, body);
        const deletion = request(path, "DELETE", author);
        put.headers.set("Sec-Fetch-Site", site);
        deletion.headers.set("Sec-Fetch-Site", site);
        assert.equal((await replace(put, context)).status, 403);
        assert.equal((await remove(deletion, context)).status, 403);
      }
      const detail = await thread(request(path, "GET", author), context);
      assert.equal(detail.status, 200);
      assert.deepEqual(await detail.json(), { incident, messages: [] });
    } finally {
      await remove(request(path, "DELETE", author), context);
    }
  });

  it("rejeita criação e edição inválidas e mantém a ocorrência após a tentativa de edição", async () => {
    const author = await session();
    const collection = "/api/incidents";
    const input = { lat: -8.145, lng: -34.999, category: "noise", description: "Registro original" };
    const before: Incident[] = await (await list(request(collection, "GET", author))).json();

    const invalid = await create(request(collection, "POST", author, { ...input, lat: -8.05 }));
    assert.equal(invalid.status, 400);
    assert.deepEqual(await (await list(request(collection, "GET", author))).json(), before);

    const response = await create(request(collection, "POST", author, input));
    assert.equal(response.status, 201);
    const incident: Incident = await response.json();
    const path = collection + "/" + incident.id;
    const context = { params: Promise.resolve({ id: incident.id }) };

    try {
      const invalidEdit = await replace(request(path, "PUT", author, {
        category: "robbery", description: "a".repeat(281),
      }), context);
      assert.equal(invalidEdit.status, 400);
      assert.equal((await replace(request(path, "PUT", author, { category: "robbery" }), context)).status, 400);
      assert.equal((await change(request(path, "PATCH", author, { action: "delete" }), context)).status, 400);
      assert.equal((await change(request(path, "PATCH", author, { action: "edit", category: "robbery", description: "" }), context)).status, 400);
      const detail = await thread(request(path, "GET", author), context);
      assert.equal(detail.status, 200);
      assert.deepEqual(await detail.json(), { incident, messages: [] });
    } finally {
      await remove(request(path, "DELETE", author), context);
    }
  });

  it("compartilha conversa e curtidas, protege autoria e aplica o ignore apenas à própria rota", async () => {
    const author = await session();
    const visitor = await session();
    assert.notEqual(author, visitor);
    const response = await create(request("/api/incidents", "POST", author, { lat: -8.145, lng: -34.999, category: "noise" }));
    assert.equal(response.status, 201);
    const incident: Incident = await response.json();
    assert.equal(incident.isOwner, true);

    const context = { params: Promise.resolve({ id: incident.id }) };
    const path = "/api/incidents/" + incident.id;
    const update = (viewer: string, action: IncidentChange) => change(request(path, "PATCH", viewer, action), context);
    const storeFetch = globalThis.fetch;
    const routingUrl = process.env.OSRM_URL;
    process.env.OSRM_URL = "https://routing.test";
    globalThis.fetch = async () => Response.json({
      code: "Ok",
      routes: [{ duration: 180, distance: 1320, geometry: { coordinates: [[-35.005, -8.145], [-34.993, -8.145]] } }],
    });

    try {
      const listed = await list(request("/api/incidents", "GET", visitor));
      assert.equal(listed.status, 200);
      assert.deepEqual(await listed.json(), [{ ...incident, isOwner: false }]);

      assert.equal((await remove(request(path, "DELETE", visitor), context)).status, 403);
      assert.equal((await replace(request(path, "PUT", visitor, { category: "incident", description: "" }), context)).status, 403);
      await update(visitor, { action: "like", value: true });
      const liked: IncidentThread = await (await update(visitor, { action: "like", value: true })).json();
      assert.equal(liked.incident.likeCount, 1);
      assert.equal(liked.incident.likedByMe, true);
      await update(visitor, { action: "message", text: "A via está bloqueada." });
      const shared: IncidentThread = await (await thread(request(path, "GET", author), context)).json();
      assert.equal(shared.incident.likedByMe, false);
      assert.equal(shared.messages[0].text, "A via está bloqueada.");
      assert.equal(shared.messages[0].isMine, false);

      assert.equal((await update(visitor, { action: "ignore", value: true })).status, 200);
      assert.equal((await thread(request(path, "GET", visitor), context)).status, 404);
      assert.deepEqual(await (await list(request("/api/incidents", "GET", visitor))).json(), []);
      const endpoints = { origin: { lat: -8.145, lng: -35.005 }, destination: { lat: -8.145, lng: -34.993 } };
      const route = async (viewer: string): Promise<RouteResult> => {
        const result = await findRoute(request("/api/routes", "POST", viewer, endpoints));
        assert.equal(result.status, 200);
        return result.json();
      };
      assert.equal((await route(author)).nearbyIncidents, 1);
      assert.equal((await route(visitor)).nearbyIncidents, 0);
      await update(visitor, { action: "ignore", value: false });
      assert.equal((await route(visitor)).nearbyIncidents, 1);

      const replacement = await replace(request(path, "PUT", author, { category: "robbery", description: "Atualizado" }), context);
      assert.equal(replacement.status, 200);
      const edited: IncidentThread = await replacement.json();
      assert.equal(edited.incident.category, "robbery");
      assert.equal(edited.incident.description, "Atualizado");
      assert.equal(edited.incident.lng, incident.lng);
      const repeated = await replace(request(path, "PUT", author, { category: "robbery", description: "Atualizado" }), context);
      assert.equal(repeated.status, 200);
      assert.deepEqual(await repeated.json(), edited);
      assert.deepEqual(edited.messages, shared.messages);
      const updated = await thread(request(path, "GET", visitor), context);
      assert.equal(updated.status, 200);
      const visible: IncidentThread = await updated.json();
      assert.equal(visible.incident.description, "Atualizado");
      assert.equal(visible.incident.category, "robbery");
      const removed = await remove(request(path, "DELETE", author), context);
      assert.equal(removed.status, 204);
      assert.equal(await removed.text(), "");
      assert.equal((await thread(request(path, "GET", visitor), context)).status, 404);
      assert.deepEqual(await (await list(request("/api/incidents", "GET", author))).json(), []);
      assert.equal((await remove(request(path, "DELETE", author), context)).status, 404);
      assert.equal((await replace(request(path, "PUT", author, { category: "robbery", description: "" }), context)).status, 404);
    } finally {
      globalThis.fetch = storeFetch;
      if (routingUrl === undefined) delete process.env.OSRM_URL;
      else process.env.OSRM_URL = routingUrl;
      await remove(request(path, "DELETE", author), context);
    }
  });
});
