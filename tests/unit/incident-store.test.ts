import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { cityCenter, isInJaboatao, territory } from "../../src/lib/territory";
import { createMemoryIncidentStore, parseIncident, parseIncidentChange, parseIncidentReplacement } from "../../src/server/incident-store";

describe("limite municipal", () => {
  it("aceita o centro e pontos no limite", () => {
    assert.equal(isInJaboatao(cityCenter), true);
    assert.equal(isInJaboatao(territory[0]), true);
  });

  it("rejeita Recife e pontos fora do polígono mesmo dentro da caixa do mapa", () => {
    assert.equal(isInJaboatao({ lat: -8.05, lng: -34.9 }), false);
    assert.equal(isInJaboatao({ lat: -8.06, lng: -34.925 }), false);
  });
});

describe("ocorrências", () => {
  const input = { ...cityCenter, category: "incident" as const, description: "Teste" };

  it("valida categoria, coordenadas e tamanho da descrição", () => {
    assert.deepEqual(parseIncident(input), input);
    assert.equal(parseIncident({ ...input, category: "constructor" }), null);
    assert.equal(parseIncident({ ...input, lat: NaN }), null);
    assert.equal(parseIncident({ ...input, description: "a".repeat(281) }), null);
  });

  it("isola instâncias e protege registros de alterações externas", async () => {
    const store = createMemoryIncidentStore();
    const created = await store.create(input);
    created.description = "Alterada";
    assert.equal((await store.list())[0].description, input.description);
    assert.deepEqual(await createMemoryIncidentStore().list(), []);
  });

  it("cria registros com identidade própria e lista os mais novos primeiro", async () => {
    const store = createMemoryIncidentStore();
    const first = await store.create(input, "owner");
    const second = await store.create({ ...input, description: "Segundo registro" }, "owner");

    assert.notEqual(first.id, second.id);
    assert.equal(new Date(first.createdAt).toISOString(), first.createdAt);
    assert.deepEqual(await store.list("owner"), [second, first]);
    assert.deepEqual(await store.thread(first.id, "owner"), {
      incident: { ...input, id: first.id, createdAt: first.createdAt, isOwner: true,
        likedByMe: false, likeCount: 0, messageCount: 0 },
      messages: [],
    });
  });

  it("reserva edição e remoção a quem registrou a ocorrência", async () => {
    const store = createMemoryIncidentStore();
    const { id } = await store.create(input, "owner");
    assert.equal(await store.change(id, "other", { action: "delete" }), "forbidden");
    assert.equal(await store.change(id, "other", { action: "edit", category: "robbery", description: "" }), "forbidden");
    await store.change(id, "owner", { action: "edit", category: "noise", description: "Barulho" });
    const [updated] = await store.list("other");
    assert.equal(updated.category, "noise");
    assert.equal(updated.description, "Barulho");
    assert.equal(updated.isOwner, false);
    assert.equal(await store.change(id, "owner", { action: "delete" }), null);
    assert.equal(await store.thread(id, "other"), null);
    assert.deepEqual(await store.list("owner"), []);
    assert.equal(await store.change(id, "owner", { action: "delete" }), "missing");
  });

  it("mantém uma curtida por pessoa e isola os registros ignorados", async () => {
    const store = createMemoryIncidentStore();
    const { id } = await store.create(input, "owner");
    await store.change(id, "other", { action: "like", value: true });
    await store.change(id, "other", { action: "like", value: true });
    await store.change(id, "other", { action: "message", text: "Mensagem" });
    const thread = await store.thread(id, "owner");
    assert.equal(thread?.incident.likeCount, 1);
    assert.equal(thread?.incident.likedByMe, false);
    assert.equal(thread?.messages[0].text, "Mensagem");
    assert.equal(thread?.messages[0].isMine, false);
    await store.change(id, "other", { action: "ignore", value: true });
    assert.deepEqual(await store.list("other"), []);
    assert.equal((await store.list("owner")).length, 1);
    await store.change(id, "other", { action: "ignore", value: false });
    assert.equal((await store.list("other"))[0].likedByMe, true);
  });

  it("valida mensagens, curtidas e edição", () => {
    assert.equal(parseIncidentChange({ action: "message", text: "   " }), null);
    assert.equal(parseIncidentChange({ action: "message", text: "x".repeat(501) }), null);
    assert.deepEqual(parseIncidentChange({ action: "message", text: " oi " }), { action: "message", text: "oi" });
    assert.equal(parseIncidentChange({ action: "like", value: "true" }), null);
  });

  it("valida todos os campos editáveis na substituição de uma ocorrência", () => {
    assert.equal(parseIncidentReplacement({ category: "__proto__", description: "" }), null);
    assert.equal(parseIncidentReplacement({ category: "noise" }), null);
    assert.equal(parseIncidentReplacement({ category: "noise", description: null }), null);
    assert.equal(parseIncidentReplacement({ category: "noise", description: "x".repeat(281) }), null);
    assert.deepEqual(parseIncidentReplacement({ category: "noise", description: "  " }), {
      action: "edit", category: "noise", description: "",
    });
    const limit = "x".repeat(280);
    assert.deepEqual(parseIncidentReplacement({ category: "noise", description: limit }), {
      action: "edit", category: "noise", description: limit,
    });
  });

  it("mantém registros anteriores sem conceder autoria", async () => {
    const legacy = { ...input, id: "legacy", createdAt: new Date().toISOString() };
    const store = createMemoryIncidentStore(Promise.resolve([legacy]));
    assert.equal((await store.list("viewer"))[0].isOwner, false);
    assert.equal(await store.change(legacy.id, "viewer", { action: "delete" }), "forbidden");
  });
});
