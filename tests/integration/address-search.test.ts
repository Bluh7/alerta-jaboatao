import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { POST } from "../../app/api/route-addresses/route";

const request = (query: string) => new Request("https://alerta.example/api/route-addresses", {
  method: "POST", body: JSON.stringify({ query }),
});

describe("busca de endereços", () => {
  it("rejeita buscas curtas e descarta resultados fora do polígono de Jaboatão", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async input => {
      calls++;
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("q"), "Rua Teste");
      assert.ok(url.searchParams.has("bbox"));
      return Response.json({ features: [
        { geometry: { coordinates: [-35.005, -8.145] }, properties: { street: "Rua Teste", district: "Prazeres" } },
        { geometry: { coordinates: [-34.925, -8.06] }, properties: { name: "Fora do município" } },
      ] });
    };
    try {
      assert.equal((await POST(request("Ru"))).status, 400);
      assert.equal(calls, 0);
      const response = await POST(request("Rua Teste"));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), [{ lat: -8.145, lng: -35.005, label: "Rua Teste · Prazeres" }]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
