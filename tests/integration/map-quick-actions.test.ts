import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import { it } from "vitest";
import { MapQuickActions } from "../../src/components/map-quick-actions";

it("destaca a rota e expõe o link tel:190 somente na largura móvel", () => {
  const html = renderToStaticMarkup(createElement(MapQuickActions, { hasTrip: false, onRoute() {} }));
  assert.match(html, /<button[^>]*class="route-launcher"/);
  assert.match(html, /Traçar rota/);
  assert.match(html, /<a[^>]*class="emergency-link"[^>]*href="tel:190"/);
  const styles = postcss.parse(readFileSync("app/globals.css", "utf8"));
  const displays: [string, string][] = [];
  styles.walkRules(".emergency-link", rule => {
    const parent = rule.parent;
    const condition = parent?.type === "atrule" ? parent.params : "";
    rule.walkDecls("display", declaration => { displays.push([condition, declaration.value]); });
  });
  assert.deepEqual(displays, [["", "none"], ["(max-width: 540px)", "inline-flex"]]);
});
