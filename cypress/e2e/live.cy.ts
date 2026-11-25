import {
  asOtherViewer, button, expandRoute, failOnce, geo, gps, label, mockClipboard, pin,
  routeHash, seedIncident, visitMap,
} from "../support/helpers";
import { categories, type Incident } from "../../src/lib/incidents";

type Live = { id: string; secret: string };
type Point = { lat: number; lng: number };
const collection = "/api/live-routes";
const path = (id: string) => `${collection}/${id}`;
const viewer = (id: string) => `/ao-vivo/${id}`;
const start = () => button(/Compartilhar ao vivo/);
const watch = () => cy.get('[title="Localização compartilhada"]', { timeout: 10_000 });
const publicLink = () => label("Link de acompanhamento ao vivo");
const expire = () => cy.contains("Este compartilhamento terminou ou está indisponível.");
const connection = () => cy.contains("Aguardando conexão para acompanhar a localização");

function seedLive() {
  return cy.request<Live>("POST", collection, { route: routeHash(), position: geo.origin })
    .then(({ body }) => cy.task("rememberLive", body, { log: false }).then(() => body));
}

function publish(id: string, secret: string, point: Point) {
  return cy.request({
    method: "PATCH", url: path(id), body: point, headers: { "X-Live-Secret": secret }, failOnStatusCode: false,
  });
}

function startInBrowser() {
  cy.intercept("POST", collection).as("start");
  start().click();
  return cy.wait<unknown, Live>("@start").then(({ response }) => {
    expect(response?.statusCode).to.equal(201);
    return cy.task("rememberLive", response!.body, { log: false }).then(() => response!.body);
  });
}

function openPublisher(rejectClipboard = false) {
  const location = gps();
  visitMap(`/${routeHash()}`, window => {
    location.install(window);
    mockClipboard(window, rejectClipboard);
  });
  expandRoute();
  start().should("be.disabled");
  label("Minha localização").click();
  location.emit(geo.origin);
  start().should("be.enabled");
  return location;
}

describe("Acompanhamento ao vivo", () => {
  it("VIVO-01 recupera falha de criação, bloqueia enquanto inicia e copia o link público", () => {
    openPublisher();
    failOnce("POST", collection, "Falha na criação");
    start().click();
    cy.contains("Não foi possível iniciar o compartilhamento ao vivo.").should("be.visible");
    cy.intercept("POST", collection, req => req.continue(res => { res.setDelay(650); })).as("slowStart");
    start().click();
    button(/Iniciando/).should("be.disabled");
    cy.wait<unknown, Live>("@slowStart").then(({ response }) => {
      expect(response?.statusCode).to.equal(201);
      const { id, secret } = response!.body;
      cy.task("rememberLive", { id, secret }, { log: false });
      publicLink().invoke("val").should("contain", viewer(id)).and("not.contain", secret);
      button("Copiar link ao vivo").click();
      cy.contains("Link ao vivo copiado.").should("be.visible");
      cy.get("@clipboard").should("have.been.calledOnce");
    });
  });

  it("VIVO-01 mantém o link manual quando o clipboard falha", () => {
    openPublisher(true);
    startInBrowser();
    button("Copiar link ao vivo").click();
    cy.contains("Selecione o link acima para copiá-lo.").should("be.visible");
    publicLink().should("have.attr", "readonly");
    publicLink().invoke("val").should("contain", "/ao-vivo/");
  });

  it("VIVO-02 publica a posição atual sem expor a credencial ao visitante", () => {
    cy.clock(Date.now(), ["setTimeout", "clearTimeout"]);
    const location = openPublisher();
    startInBrowser().then(({ id, secret }) => {
      publicLink().invoke("val").should("contain", viewer(id)).and("not.contain", secret);
      cy.intercept("PATCH", path(id)).as("publish");
      cy.get(".user-location-marker").then($previous => {
        location.emit(geo.outside);
        cy.get(".user-location-marker").should($current => {
          expect($current[0]).not.to.equal($previous[0]);
        });
      });
      cy.tick(4000);
      cy.wait("@publish").its("request.body").should("deep.equal", geo.outside);
      cy.request(path(id)).its("body").should("deep.equal", { position: geo.outside });
    });
  });

  it("VIVO-03 e VIVO-04 atualizam posição, trajeto e ocorrências visíveis", () => {
    seedIncident({ ...geo.near, description: "Acontecimento no trajeto" });
    seedIncident({ ...geo.far, category: "fight" });
    seedIncident({ ...geo.near, lng: geo.near.lng - 0.0005, category: "robbery" }).then(hidden => {
      asOtherViewer();
      cy.request("PATCH", `/api/incidents/${hidden.id}`, { action: "ignore", value: true });
    });
    seedLive().then(({ id, secret }) => {
      cy.intercept("GET", `${path(id)}*`, request => {
        if (request.query.incidents === "1" && !request.query.route) request.alias = "incidentRefresh";
      }).as("poll");
      cy.visit(viewer(id));
      cy.wait("@poll").its("response.body.incidents").should("have.length", 1);
      cy.contains("Destino: Rua Destino · Prazeres").should("be.visible");
      cy.get('.leaflet-overlay-pane path[stroke="#1767d6"]').should("exist");
      watch().should("be.visible");
      label("Centralizar na localização compartilhada").should("be.enabled").click();
      pin("Barulho").should("exist");
      pin("Briga").should("not.exist");
      pin("Assalto").should("not.exist");
      cy.get(".incident-area").should("have.length", 1).and("have.attr", "fill", categories.noise.color);
      // This marker is outside the current viewport at the follower's initial zoom.
      // Zoom out through the public control before opening it.
      label("Afastar mapa").click();
      label("Afastar mapa").click();
      pin("Barulho").click();
      cy.get("#live-incident-title").should("have.text", "Barulho");
      cy.contains("Acontecimento no trajeto").should("be.visible");
      cy.get('[aria-labelledby="live-incident-title"] time').should("have.attr", "datetime");
      label("Fechar ocorrência").click();
      cy.get("#live-incident-title").should("not.exist");
      seedIncident({ ...geo.near, lng: geo.near.lng + 0.0005, category: "disorder" });
      watch().then($previous => {
        publish(id, secret, geo.outside).its("status").should("eq", 204);
        watch().should($current => expect($current[0]).not.to.equal($previous[0]));
      });
      cy.wait<unknown, { position: Point; incidents: Incident[] }>("@incidentRefresh", { requestTimeout: 22_000 }).then(({ response }) => {
        expect(response?.body.position).to.deep.equal(geo.outside);
        expect(response?.body.incidents).to.have.length(2);
        expect(response?.body.incidents.map(item => item.description)).to.include("Acontecimento no trajeto");
      });
      pin("Desordem").should("exist");
      cy.get(".incident-area").should("have.length", 2).filter(`[fill="${categories.disorder.color}"]`).should("exist");
    });
  });

  it("VIVO-05 reconecta publicador após falha e permite nova sessão em 404", () => {
    cy.clock(Date.now(), ["setTimeout", "clearTimeout"]);
    openPublisher();
    startInBrowser().then(({ id }) => {
      publicLink().should("be.visible");
      cy.intercept("PATCH", path(id)).as("publish");
      failOnce("PATCH", path(id), "Falha na publicação");
      cy.tick(4000);
      cy.contains("Reconectando o compartilhamento").should("be.visible");
      cy.tick(4000);
      cy.wait("@publish").its("response.statusCode").should("eq", 204);
      cy.contains("Reconectando o compartilhamento").should("not.exist");
      failOnce("PATCH", path(id), "Sessão indisponível", 404);
      cy.tick(4000);
      cy.contains("Compartilhamento encerrado. Você pode iniciar um novo.").should("be.visible");
      start().should("be.enabled");
    });
  });

  it("VIVO-05 reconecta visitante e restaura a posição", () => {
    seedLive().then(({ id }) => {
      cy.visit(viewer(id));
      watch().should("be.visible");
      failOnce("GET", `${path(id)}*`, "Falha de conexão");
      cy.wait("@failure");
      connection().should("be.visible");
      watch().should("not.exist");
      watch().should("be.visible");
      connection().should("not.exist");
    });
  });

  for (const ending of ["manual", "GPS", "resumo", "página"] as const) {
    it(`VIVO-06 encerra a sessão por ${ending}`, () => {
      const location = openPublisher();
      startInBrowser().then(({ id }) => {
        publicLink().should("be.visible");
        cy.intercept("DELETE", path(id)).as("stop");
        if (ending === "manual") label("Encerrar compartilhamento ao vivo").click();
        if (ending === "GPS") location.fail(2);
        if (ending === "resumo") button(/^Comparar rotas$/).click();
        if (ending === "página") cy.visit("/");
        cy.wait("@stop").its("request.headers").should("have.property", "x-live-secret");
        cy.visit(viewer(id));
        expire().should("be.visible");
        watch().should("not.exist");
      });
    });
  }

  it("VIVO-07 expira sessão sem publicar e preserva uma sessão renovada", () => {
    seedLive().then(expired => {
      seedLive().then(renewed => {
        cy.task<number>("serverTime").then(created => {
          cy.visit(viewer(expired.id));
          watch().should("be.visible");
          cy.task("waitServerTime", { until: created + 8000 });
          publish(renewed.id, renewed.secret, geo.outside).its("status").should("eq", 204);
          cy.task("waitServerTime", { until: created + 52_000, url: path(expired.id) }, { timeout: 55_000 }).should("eq", 404);
          cy.request(path(renewed.id)).its("body.position").should("deep.equal", geo.outside);
          expire().should("be.visible");
          watch().should("not.exist");
          cy.visit(viewer("inexistente"));
          expire().should("be.visible");
        });
      });
    });
  });

  it("VIVO-08 protege a posição e o encerramento com a credencial de publicação", () => {
    seedLive().then(({ id }) => {
      for (const method of ["PATCH", "DELETE"] as const) {
        for (const headers of [{}, { "X-Live-Secret": "incorreta" }]) {
          cy.request({ method, url: path(id), body: method === "PATCH" ? geo.outside : undefined, headers, failOnStatusCode: false })
            .its("status").should("eq", 404);
        }
      }
      cy.request(path(id)).its("body.position").should("deep.include", { lat: geo.origin.lat, lng: geo.origin.lng });
      cy.visit(viewer(id));
      watch().should("be.visible");
    });
  });
});
