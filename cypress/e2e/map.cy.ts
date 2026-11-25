import { button, cookieName, geo, gps, label, map, pin, rememberAuthor, seedIncident, stubTiles, visitMap } from "../support/helpers";
import { categories } from "../../src/lib/incidents";

describe("Mapa e navegação", () => {
  it("MAP-01 carrega o mapa vazio e preserva a sessão e os marcadores ao recarregar", () => {
    visitMap();
    cy.get(".incident-pin").should("not.exist");
    rememberAuthor().then(cookie => {
      seedIncident();
      cy.reload();
      cy.getCookie(cookieName).its("value").should("eq", cookie);
      pin("Barulho").should("be.visible");
    });
  });

  it("MAP-02 informa falha no carregamento inicial e recupera ao recarregar", () => {
    seedIncident();
    cy.intercept({ method: "GET", url: "/api/incidents", times: 1 }, { statusCode: 503, body: {} }).as("offline");
    cy.visit("/");
    cy.wait("@offline");
    cy.contains('[role="status"]', "Não foi possível carregar as ocorrências.").should("be.visible");
    cy.reload();
    pin("Barulho").should("be.visible");
  });

  it("MAP-03 informa falha nos tiles e recupera quando voltam", () => {
    cy.intercept("GET", "https://tile.openstreetmap.org/**", { statusCode: 503, headers: { "Cache-Control": "no-store" } });
    visitMap();
    cy.contains('[role="status"]', "O mapa de ruas está indisponível.").should("be.visible");
    stubTiles().as("tile");
    cy.reload();
    cy.wait("@tile");
    map().find(".leaflet-tile-loaded").should("exist");
    cy.contains("O mapa de ruas está indisponível.").should("not.exist");
  });

  it("MAP-04 respeita limites de zoom e recentra após navegar", () => {
    seedIncident();
    visitMap();
    label("Afastar mapa").should("be.disabled");
    for (let step = 1; step <= 4; step++) {
      label("Aproximar mapa").click();
      cy.get(".map-shell").should($shell => {
        expect($shell[0].style.getPropertyValue("--incident-pin-size")).to.equal(`${40 + step * 3.5}px`);
      });
    }
    label("Aproximar mapa").should("be.disabled");
    label("Afastar mapa").click().should("be.enabled");
    label("Aproximar mapa").should("be.enabled");
    label("Recentrar em Jaboatão").click();
    label("Afastar mapa").should("be.disabled");
    pin("Barulho").should("be.visible");
  });

  it("MAP-04 retorna ao centro válido após arrastar para fora do município", () => {
    const location = gps();
    const edge = { lat: -8.169, lng: -34.916 };
    seedIncident(edge);
    visitMap("/", location.install);
    label("Minha localização").click();
    location.emit(edge);
    cy.get(".user-location-marker").should("exist");
    label("Minha localização").click();
    const markerX = ($pin: JQuery<HTMLElement>) => $pin[0].getBoundingClientRect().left;
    let originalX: number;
    pin("Barulho").then($pin => { originalX = markerX($pin); });
    map().then($map => {
      const element = $map[0];
      const frame = element.getBoundingClientRect();
      const x = frame.left + frame.width * 0.8;
      const y = frame.top + frame.height / 2;
      cy.wrap(element).trigger("mousedown", { eventConstructor: "MouseEvent", which: 1, button: 0, buttons: 1, clientX: x, clientY: y });
      cy.wrap(element).trigger("mousemove", { eventConstructor: "MouseEvent", which: 1, buttons: 1, clientX: x - 20, clientY: y, force: true });
      cy.wrap(element).trigger("mousemove", { eventConstructor: "MouseEvent", which: 1, buttons: 1, clientX: x - 470, clientY: y, force: true });
      pin("Barulho").should($pin => expect(markerX($pin)).to.be.lessThan(originalX - 350));
      cy.wrap(element).trigger("mouseup", { eventConstructor: "MouseEvent", button: 0, clientX: x - 470, clientY: y, force: true });
    });
    pin("Barulho").should($pin => expect(markerX($pin)).to.be.closeTo(originalX, 2));
  });

  it("MAP-05 aplica categorias e fecha detalhes incompatíveis", () => {
    seedIncident();
    seedIncident({ category: "fight", lng: geo.origin.lng + 0.0008 });
    visitMap();
    pin("Barulho").click();
    label("Filtros").click();
    button(/^Briga$/).click();
    label("Filtro ativo").should("exist");
    pin("Barulho").should("not.exist");
    pin("Briga").should("be.visible");
    cy.get("#incident-heading").should("not.exist");
    label("Filtros").click();
    button("Todas as ocorrências").click();
    pin("Barulho").should("be.visible");
  });

  it("MAP-06 abre registro e detalhes com teclado e fecha com Escape", () => {
    seedIncident();
    visitMap();
    map().focus().trigger("keydown", { key: "Enter" });
    cy.contains("h2", "O que aconteceu?").should("be.visible");
    cy.focused().trigger("keydown", { key: "Escape" });
    pin("Ponto selecionado").should("not.exist");
    pin("Barulho").focus().trigger("keydown", { key: " " });
    cy.get("#incident-heading").should("have.text", "Barulho");
    cy.focused().trigger("keydown", { key: "Escape" });
    cy.get("#incident-heading").should("not.exist");
  });

  it("MAP-07 desenha a área na cor da categoria e acompanha zoom e filtros", () => {
    seedIncident();
    seedIncident({ category: "fight", lng: geo.origin.lng + 0.002 });
    visitMap();
    const areas = () => cy.get(".incident-area");
    const noiseArea = () => cy.get<SVGPathElement>(`.incident-area[fill="${categories.noise.color}"]`);
    areas().should("have.length", 2);
    areas().filter(`[fill="${categories.fight.color}"]`).should("be.visible");
    noiseArea().should($area => {
      expect($area[0].getBBox().width).to.be.closeTo(254, 5);
    });
    label("Aproximar mapa").click();
    noiseArea().should($area => {
      expect($area[0].getBBox().width).to.be.closeTo(508, 8);
    });
    map().then($map => {
      cy.wrap($map).click(Math.floor($map.width()! / 2) + 65, Math.floor($map.height()! / 2) + 25);
    });
    pin("Ponto selecionado").should("exist");
    areas().should("have.length", 2);
    label("Cancelar registro").click();
    label("Filtros").click();
    button(/^Briga$/).click();
    areas().should("have.length", 1).and("have.attr", "fill", categories.fight.color);
    pin("Briga").click();
    cy.get("#incident-heading").should("have.text", "Briga");
    label("Fechar ocorrência").click();
    label("Filtros").click();
    button("Todas as ocorrências").click();
    label("Recentrar em Jaboatão").click();
    areas().should("have.length", 2);
    noiseArea().should($area => {
      expect($area[0].getBBox().width).to.be.closeTo(254, 5);
    });
  });
});
