import {
  actorRequest, asOtherViewer, button, geo, gps, label, pin, rememberAuthor, seedIncident, visitMap,
} from "../support/helpers";
import type { Incident } from "../../src/lib/incidents";

const diaryPath = "/api/incidents?diary=1";
const diary = () => cy.get("#incident-diary");
const locationPin = () => cy.get(".user-location-marker");

describe("Diário", () => {
  it("DIA-01 exibe carregamento, falha, recuperação e lista vazia", () => {
    cy.clock(Date.now(), ["setInterval", "clearInterval"]);
    visitMap();
    cy.intercept("GET", diaryPath).as("diary");
    cy.intercept({ method: "GET", url: diaryPath, times: 1 }, { delay: 600, statusCode: 503, body: {} });
    button(/^Diário$/).click();
    diary().should("be.visible").and("contain.text", "Carregando ocorrências de hoje");
    diary().should("contain.text", "Não foi possível atualizar o diário.");
    cy.tick(30_000);
    cy.wait("@diary");
    diary().should("contain.text", "Nenhuma ocorrência hoje");
  });

  it("DIA-02 aplica meia-noite de Recife, ordem e horário local", () => {
    cy.clock(Date.parse("2026-11-24T03:30:00Z"), ["Date"]);
    const sample: Incident = { ...geo.origin, id: "one", category: "noise", description: "", createdAt: "" };
    cy.intercept("GET", diaryPath, [
      { ...sample, createdAt: "2026-11-24T03:00:00Z", locationLabel: "Rua de Referência" },
      { ...sample, id: "old", category: "robbery", createdAt: "2026-11-24T02:59:59Z" },
      { ...sample, id: "new", category: "fight", createdAt: "2026-11-24T03:10:00Z" },
    ]);
    visitMap();
    button(/^Diário$/).click();
    label("Ocorrências de hoje").find("li").should($entries => {
      expect($entries).to.have.length(2);
      expect($entries[0].textContent).to.include("Briga");
      expect($entries[0].textContent).to.include("00:10");
      expect($entries[0].textContent).to.include("Ponto no mapa em Jaboatão");
      expect($entries[1].textContent).to.include("00:00");
      expect($entries[1].textContent).to.include("Rua de Referência");
    });
  });

  it("DIA-03 atualiza a lista a cada 30 segundos e para após fechar", () => {
    cy.clock(Date.now(), ["setInterval", "clearInterval"]);
    seedIncident().then(() => rememberAuthor()).then(author => {
      asOtherViewer();
      visitMap();
      cy.intercept("GET", diaryPath).as("diary");
      button(/^Diário$/).click();
      cy.wait("@diary");
      diary().should("contain.text", "Rua de Referência");
      actorRequest("POST", "/api/incidents", author, { category: "fight", ...geo.near }).its("status").should("eq", 201);
      cy.tick(30_000);
      cy.wait("@diary");
      diary().should("contain.text", "Briga").and("contain.text", "Ponto no mapa em Jaboatão");
      label("Fechar diário").click();
      cy.tick(60_000);
      cy.get("@diary.all").should("have.length", 2);
    });
  });

  it("DIA-04 abre o ponto filtrado e restaura foco ao fechar o diário", () => {
    seedIncident({ category: "fight", ...geo.near });
    visitMap();
    label("Filtros").click();
    button(/^Barulho$/).click();
    button(/^Diário$/).click();
    label("Ocorrências de hoje").contains("button", "Briga").click();
    diary().should("not.exist");
    label("Filtro ativo").should("not.exist");
    pin("Briga").should("be.visible").and("have.attr", "aria-expanded", "true");
    cy.get("#incident-heading").should("have.text", "Briga");
    button(/^Diário$/).click();
    label("Fechar diário").click();
    button(/^Diário$/).should("be.focused").click();
    cy.get<HTMLDialogElement>("#incident-diary").then($dialog => $dialog[0].requestClose());
    diary().should("not.exist");
    button(/^Diário$/).should("be.focused");
  });
});

describe("Geolocalização", () => {
  it("GPS-01 e GPS-02 acompanham posições, recentram e cancelam o monitoramento", () => {
    const location = gps();
    seedIncident();
    visitMap("/", location.install);
    label("Minha localização").click().should("have.attr", "aria-pressed", "true");
    cy.contains("Buscando sua localização").should("be.visible");
    location.emit(geo.origin);
    locationPin().should("be.visible");
    location.emit({ lat: geo.origin.lat, lng: geo.origin.lng + 0.001 });
    label("Centralizar na minha localização").click();
    locationPin().should("be.visible");
    location.emit(geo.outside);
    locationPin().should("be.visible");
    label("Minha localização").click();
    cy.get("@clearWatch").should("have.been.calledWith", 42);
    locationPin().should("not.exist");
    location.emit(geo.origin);
    locationPin().should("not.exist");
    pin("Barulho").should("be.visible");
  });

  it("GPS-03 trata navegador sem geolocalização", () => {
    visitMap("/", window => {
      Object.defineProperty(window.navigator, "geolocation", { configurable: true, value: undefined });
    });
    label("Minha localização").click();
    cy.contains("A localização está indisponível.").should("be.visible");
    label("Minha localização").should("have.attr", "aria-pressed", "false");
  });

  it("GPS-03 trata negação, perda de sinal, timeout e coordenadas inválidas", () => {
    const location = gps();
    visitMap("/", location.install);
    label("Minha localização").click();
    location.fail(1);
    cy.contains("Acesso à localização negado.").should("be.visible");
    label("Minha localização").should("have.attr", "aria-pressed", "false").click();
    location.emit(geo.origin);
    locationPin().should("exist");
    location.fail(2);
    cy.contains("Aguardando um sinal de localização.").should("be.visible");
    locationPin().should("not.exist");
    location.emit(geo.origin);
    locationPin().should("exist");
    location.fail(3);
    cy.contains("Aguardando um sinal de localização.").should("be.visible");
    location.emit({ lat: 100, lng: 0 });
    locationPin().should("not.exist");
    location.emit(geo.origin);
    locationPin().should("be.visible");
  });
});
