import geo from "../fixtures/geo.json";
import type { Incident, NewIncident } from "../../src/lib/incidents";
import type { Location } from "../../src/lib/territory";
import { routeShareUrl } from "../../src/lib/shared-route";
import type { TravelMode } from "../../src/lib/trip";

export { geo };
export const cookieName = "alerta_viewer";
export const map = () => cy.get('[aria-label^="Mapa de Jaboatão"]');
export const label = (name: string) => cy.get(`[aria-label="${name}"]`);
export const button = (name: string | RegExp) => cy.contains("button", name);
export const routeLauncher = () => cy.get('button[aria-haspopup="dialog"]');
export const pin = (name: string) => cy.get(`.incident-pin[aria-label="${name}"]`);
export const detail = () => cy.get('[aria-labelledby="incident-heading"]');

export function stubTiles() {
  return cy.intercept("GET", "https://tile.openstreetmap.org/**", {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    fixture: "tile.png,null",
  });
}

export function visitMap(path = "/", onBeforeLoad?: (window: Cypress.AUTWindow) => void) {
  cy.intercept("GET", "/api/incidents").as("incidents");
  cy.visit(path, { onBeforeLoad });
  cy.wait("@incidents");
  label("Aproximar mapa").should("be.enabled");
}

export function rememberAuthor() {
  return cy.getCookie(cookieName)
    .should("exist")
    .then(cookie => {
      const value = cookie!.value;
      return cy.task("rememberAuthor", value, { log: false }).then(() => value);
    });
}

export function useViewer(cookie: string) {
  return cy.setCookie(cookieName, cookie, { httpOnly: true, sameSite: "lax", log: false });
}

export function seedIncident(overrides: Partial<NewIncident> = {}) {
  return cy.request<Incident>("POST", "/api/incidents", {
    lat: geo.origin.lat,
    lng: geo.origin.lng,
    category: "noise",
    description: "",
    ...overrides,
  }).then(({ body, status }) => {
    expect(status).to.equal(201);
    return rememberAuthor().then(() => body);
  });
}

export function asOtherViewer() {
  cy.clearCookie(cookieName);
  return cy.request("/api/incidents").then(() => cy.getCookie(cookieName)).then(cookie => cookie!.value);
}

export function actorRequest(method: Cypress.HttpMethod, url: string, cookie: string, body?: object) {
  // The explicit cookie takes precedence over the current browser cookie for this request.
  return cy.request({ method, url, body, headers: { Cookie: `${cookieName}=${cookie}` }, failOnStatusCode: false });
}

export function failOnce(method: Cypress.HttpMethod, url: string, message: string, statusCode = 503) {
  return cy.intercept({ method, url, times: 1 }, { statusCode, body: { error: message } }).as("failure");
}

export function gps() {
  let success: PositionCallback;
  let error: PositionErrorCallback;
  return {
    install(window: Cypress.AUTWindow) {
      const location = {
        watchPosition: cy.stub().callsFake((receive: PositionCallback, fail: PositionErrorCallback) => {
          success = receive;
          error = fail;
          return 42;
        }).as("watch"),
        clearWatch: cy.stub().as("clearWatch"),
      };
      Object.defineProperty(window.navigator, "geolocation", { configurable: true, value: location });
    },
    emit(point: Location) {
      cy.get("@watch").should("have.been.called");
      cy.then(() => {
        success({ coords: { latitude: point.lat, longitude: point.lng } } as GeolocationPosition);
      });
    },
    fail(code: number) {
      cy.get("@watch").should("have.been.called");
      cy.then(() => error({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError));
    },
  };
}

export function mockClipboard(window: Cypress.AUTWindow, reject = false) {
  const write = cy.stub().as("clipboard");
  if (reject) write.rejects();
  else write.resolves();
  Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText: write } });
}

export function routeHash(mode: TravelMode = "car", start = geo.origin) {
  return new URL(routeShareUrl("http://localhost/", {
    origin: start,
    destination: geo.destination,
    path: [start, geo.destination],
    duration: 300,
    distance: 1500,
    nearbyIncidents: 0,
  }, mode)).hash;
}

export function planRoute(origin = "Rua Origem", destination = "Rua Destino") {
  routeLauncher().click();
  if (origin) cy.get("#route-origin").clear().type(origin);
  cy.get("#route-destination").clear().type(destination);
  cy.get("#route-planner").contains("button", "Traçar rota").click();
}

export function expandRoute() {
  label("Expandir opções da rota").click();
  cy.contains("h2", "Rota escolhida").should("be.visible");
}
