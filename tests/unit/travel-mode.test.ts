import assert from "node:assert/strict";
import { it } from "vitest";
import { isTravelMode } from "../../src/lib/trip";

it("aceita os três modos de transporte conhecidos", () => {
  for (const mode of ["car", "foot", "bike"]) assert.equal(isTravelMode(mode), true);
  for (const mode of ["train", "constructor", null, undefined]) assert.equal(isTravelMode(mode), false);
});
