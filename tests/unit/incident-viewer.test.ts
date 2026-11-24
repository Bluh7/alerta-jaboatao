import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { incidentViewerSession, readIncidentViewer } from "../../src/server/incident-viewer";

describe("sessão de ocorrência", () => {
  it("gera um cookie privado e reaproveita a identidade nas chamadas seguintes", () => {
    const request = new Request("https://alerta.example/api/incidents");
    const session = incidentViewerSession(request);
    const response = session.setCookie(Response.json([]));
    const cookie = response.headers.get("Set-Cookie");
    assert.ok(cookie);
    assert.match(cookie, /HttpOnly; SameSite=Lax; Secure/);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const followUp = new Request(request.url, { headers: { Cookie: cookie.split(";")[0] } });
    assert.equal(readIncidentViewer(followUp), session.viewer);
    assert.equal(incidentViewerSession(followUp).setCookie(Response.json([])).headers.has("Set-Cookie"), false);
  });

  it("rejeita identificadores inválidos e cookies com nomes parecidos", () => {
    const invalid = new Request("http://alerta.example", { headers: { Cookie: "xalerta_viewer=123; alerta_viewer=invalid" } });
    assert.equal(readIncidentViewer(invalid), undefined);
  });
});
