import { stubTiles } from "./helpers";

let visitedUi = false;
let screenshotNumber = 0;
Cypress.on("window:before:load", window => {
  const baseUrl = Cypress.config("baseUrl");
  if (baseUrl && window.location.origin === new URL(baseUrl).origin) visitedUi = true;
});

before(() => {
  screenshotNumber = 0;
  cy.task("prepareScreenshotSpec", Cypress.spec.relative);
});

beforeEach(() => {
  visitedUi = false;
  cy.task("cleanState");
  stubTiles();
});

afterEach(function () {
  if (!visitedUi || this.currentTest?.state !== "passed") return;

  const title = Cypress.currentTest.titlePath.join(" ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
  const number = String(++screenshotNumber).padStart(3, "0");
  cy.screenshot(`ui-pass--${number}-${title}`, { capture: "viewport", overwrite: false });
});
