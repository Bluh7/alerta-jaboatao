import { button, geo, label, map, pin, planRoute, rememberAuthor, routeHash, routeLauncher, visitMap } from "../support/helpers";

function withinScreen(selector: string) {
  cy.get(selector).should("be.visible").and($element => {
    const { left, right } = $element[0].getBoundingClientRect();
    expect(left).to.be.at.least(0);
    expect(right).to.be.at.most($element[0].ownerDocument.documentElement.clientWidth);
  });
}

describe("Layout móvel e teclado", () => {
  it("mostra o convite de Juba a cada visita e permite abrir a conversa por ele", () => {
    cy.viewport(320, 700);
    cy.visit("/");
    withinScreen(".chat-invite");
    cy.get(".chat-invite-message").should("have.length", 1);
    cy.get(".chat-invite-message").should("have.length", 2).first().invoke("text").as("firstGreeting", { type: "static" });
    cy.get(".chat-invite", { timeout: 10000 }).should("not.exist");
    cy.get("#incident-chat").should("not.be.visible");
    cy.reload();
    cy.get("@firstGreeting").then(previous => {
      cy.get(".chat-invite-message").first().should("not.have.text", previous).click();
    });
    cy.get("#incident-chat").should("be.visible");
    label("Minimizar conversa").click();
    cy.get(".chat-invite").should("not.exist");
  });

  it("CHAT-01 mantém o menu acessível em 320 px e permite reenviar uma pergunta", () => {
    cy.viewport(320, 700);
    const question = "Quais são as ocorrências mais recentes?";
    const reply = "Há um relato de barulho registrado hoje em Prazeres.";
    cy.intercept("POST", "/api/chat", { body: { reply } }).as("chat");
    cy.intercept({ method: "POST", url: "/api/chat", times: 1 }, {
      statusCode: 503, body: { error: "O assistente está indisponível no momento." },
    }).as("failure");

    visitMap();
    withinScreen(".chat-toggle");
    cy.get(".chat-toggle img").should($image => {
      expect($image).to.have.attr("src", "/mascote-assistente.svg");
      expect($image.prop("naturalWidth")).to.be.greaterThan(0);
    });
    label("Conversa com Juba").should("have.text", "").click();
    withinScreen("#incident-chat");
    cy.get("#incident-chat").should("not.contain.text", "Gemini");
    cy.get("dialog[open]").should("not.exist");
    cy.focused().should("have.attr", "aria-label", "Minimizar conversa");
    cy.get("#chat-heading").should("have.text", "Juba");
    cy.get("#incident-chat [role=log] .chat-assistant").should("have.length", 2);
    button("Últimos relatos").click();
    cy.wait("@failure");
    cy.get("#incident-chat [role=alert]").should("contain.text", "O assistente está indisponível");
    cy.get("#chat-question").should("have.value", question).type("{enter}");
    cy.wait("@chat").its("request.body").should("deep.equal", { message: question, history: [] });
    cy.get("#incident-chat [role=log]").should("contain.text", reply);

    cy.get("#chat-question").type("Em qual bairro?{enter}");
    cy.wait("@chat").its("request.body").should("deep.equal", {
      message: "Em qual bairro?", history: [{ role: "user", text: question }, { role: "assistant", text: reply }],
    });
    cy.get("#chat-question").focus();
    cy.press(Cypress.Keyboard.Keys.ESC);
    cy.get("#incident-chat").should("not.be.visible");
    cy.focused().should("have.attr", "aria-label", "Conversa com Juba");
    cy.press(Cypress.Keyboard.Keys.ENTER);
    cy.get("#incident-chat").should("be.visible");
    label("Filtros").click().should("have.attr", "aria-expanded", "true");
    cy.get("#incident-chat").should("not.be.visible");
    label("Filtros").click();
    label("Conversa com Juba").click();
    cy.get("#incident-chat [role=log]").should("contain.text", reply);
  });

  it("CHAT-02 arrasta o ícone para perto do canto superior esquerdo e ajusta a posição ao soltar", () => {
    cy.viewport(390, 844);
    visitMap();

    const pointer = { eventConstructor: "PointerEvent", pointerId: 7, pointerType: "touch", isPrimary: true, button: 0 };
    const launch = () => label("Conversa com Juba");
    launch().then($button => {
      const { x, y, width, height } = $button[0].getBoundingClientRect();
      launch().trigger("pointerdown", { ...pointer, clientX: x + width / 2, clientY: y + height / 2 });
    });
    launch().trigger("pointermove", { ...pointer, clientX: 105, clientY: 225 }).should($button => {
      const { x, y, width, height } = $button[0].getBoundingClientRect();
      expect(x + width / 2).to.be.closeTo(105, 1);
      expect(y + height / 2).to.be.closeTo(225, 1);
    });
    launch().trigger("pointerup", { ...pointer, clientX: 105, clientY: 225 });
    launch().trigger("click", { eventConstructor: "MouseEvent", detail: 1 }).should("have.attr", "aria-expanded", "false");
    cy.get(".assistant-widget").should($widget => {
      expect($widget).to.have.attr("data-vertical", "top");
      expect($widget).to.have.attr("data-horizontal", "left");
    });
    launch().should($button => {
      const { left, top } = $button[0].getBoundingClientRect();
      expect(left).to.be.closeTo(14, 1);
      expect(top).to.be.closeTo(76, 1);
    }).click();
    withinScreen("#incident-chat");
    cy.get("#incident-chat").should($panel => {
      const launcher = $panel.siblings(".chat-toggle")[0];
      expect($panel[0].getBoundingClientRect().top).to.be.greaterThan(launcher.getBoundingClientRect().bottom);
    });
    cy.press(Cypress.Keyboard.Keys.ESC);
    cy.press(Cypress.Keyboard.Keys.RIGHT);
    cy.press(Cypress.Keyboard.Keys.DOWN);
    cy.get(".assistant-widget").should($widget => {
      expect($widget).to.have.attr("data-vertical", "bottom");
      expect($widget).to.have.attr("data-horizontal", "right");
    });
  });

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
