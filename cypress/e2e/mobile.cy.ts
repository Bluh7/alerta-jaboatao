import { button, geo, label, map, pin, planRoute, rememberAuthor, routeHash, routeLauncher, visitMap } from "../support/helpers";

function withinScreen(selector: string) {
  cy.get(selector).should("be.visible").and($element => {
    const { left, right } = $element[0].getBoundingClientRect();
    expect(left).to.be.at.least(0);
    expect(right).to.be.at.most($element[0].ownerDocument.documentElement.clientWidth);
  });
}

describe("Layout móvel e teclado", () => {
  it("MOV-01 mantém registro, chat, Diário, planejador e visor ao vivo acessíveis em 390 × 844", () => {
    cy.viewport(390, 844);
    visitMap();
    rememberAuthor();
    map().click("center");
    withinScreen(".incident-picker");
    label("Tipos de ocorrência").scrollTo("bottom");
    label("Buscar tipo de ocorrência").type("barulho");
    button(/^Barulho$/).click();
    pin("Barulho").click();
    button(/Chat/).click();
    label("Mensagem").type("Mensagem em tela pequena");
    label("Enviar mensagem").click();
    cy.get('[role="log"]').should("contain.text", "Mensagem em tela pequena");
    withinScreen(".incident-detail-sheet");
    label("Fechar ocorrência").click();
    button(/^Diário$/).click();
    withinScreen("#incident-diary");
    label("Fechar diário").click();
    planRoute();
    withinScreen(".route-summary");
    button("Escolher esta rota").click();
    label("Expandir opções da rota").click();
    button(/^Copiar link$/).scrollIntoView().should("be.visible");
    cy.request<{ id: string; secret: string }>("POST", "/api/live-routes", {
      route: routeHash(), position: geo.origin,
    }).then(({ body }) => {
      cy.task("rememberLive", body, { log: false });
      cy.visit(`/ao-vivo/${body.id}`);
      withinScreen(".live-view-heading");
      cy.get('[title="Localização compartilhada"]').should("be.visible");
      cy.document().should(document => {
        expect(document.documentElement.scrollWidth).to.equal(document.documentElement.clientWidth);
      });
    });
  });

  it("MOV-02 exibe o atalho tel:190 somente até 540 px", () => {
    cy.viewport(540, 844);
    visitMap();
    label("Emergência policial, ligar 190").should("be.visible").and("have.attr", "href", "tel:190");
    cy.viewport(541, 844);
    label("Emergência policial, ligar 190").should("not.be.visible");
  });

  it("MOV-03 mantém foco no diálogo e pula opções de rota recolhidas", () => {
    cy.viewport(390, 844);
    visitMap(`/${routeHash()}`);
    label("Expandir opções da rota").should("have.attr", "aria-expanded", "false").focus();
    cy.press(Cypress.Keyboard.Keys.TAB);
    cy.focused().should($element => {
      expect($element.closest("#route-summary-options")).to.have.length(0);
    });
    routeLauncher().click();
    cy.focused().closest("#route-planner").should("exist");
    for (let step = 0; step < 5; step++) {
      cy.press(Cypress.Keyboard.Keys.TAB);
      cy.focused().closest("#route-planner").should("exist");
    }
    label("Fechar planejador de rota").click();
    cy.get("#route-planner").should("not.exist");
  });
});
