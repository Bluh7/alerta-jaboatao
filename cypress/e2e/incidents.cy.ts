import { categories } from "../../src/lib/incidents";
import {
  actorRequest, asOtherViewer, button, detail, failOnce, geo, gps, label, map, pin,
  rememberAuthor, seedIncident, useViewer, visitMap,
} from "../support/helpers";

const create = () => map().click("center");
const heading = () => cy.get("#incident-heading");
const open = (category = "Barulho") => pin(category).click();
const like = () => detail().contains("button", /Curtir/);
const chat = () => detail().contains("button", /Chat/).click();
const path = (id: string) => `/api/incidents/${id}`;

describe("Ocorrências", () => {
  it("OCO-01 registra no ponto escolhido e mantém autoria após recarregar", () => {
    visitMap();
    rememberAuthor();
    cy.intercept("POST", "/api/incidents").as("create");
    create();
    pin("Ponto selecionado").should("exist");
    button(/^Barulho$/).click();
    cy.wait("@create").then(({ request, response }) => {
      expect(request.body.lat).to.be.closeTo(geo.origin.lat, 0.00003);
      expect(request.body.lng).to.be.closeTo(geo.origin.lng, 0.00003);
      expect(response?.statusCode).to.equal(201);
    });
    cy.contains("Ocorrência registrada no mapa.").should("be.visible");
    open();
    heading().should("have.text", "Barulho");
    button("Editar").should("be.visible");
    cy.reload();
    open();
    button("Editar").should("be.visible");
  });

  it("OCO-02 rejeita ponto externo e permite cancelar com botão e Escape", () => {
    const location = gps();
    visitMap("/", location.install);
    create();
    label("Cancelar registro").click();
    create();
    cy.focused().trigger("keydown", { key: "Escape" });
    pin("Ponto selecionado").should("not.exist");
    label("Minha localização").click();
    location.emit(geo.outside);
    cy.get(".user-location-marker").should("be.visible");
    create();
    cy.contains("Escolha um ponto dentro de Jaboatão.").should("be.visible");
    cy.request("/api/incidents").its("body").should("deep.equal", []);
  });

  it("OCO-03 ordena e pesquisa as 18 categorias", () => {
    visitMap();
    create();
    const expected = Object.values(categories).map(item => item.label).sort(new Intl.Collator("pt-BR").compare);
    label("Tipos de ocorrência").find("button").should($buttons => {
      expect([...$buttons].map(item => item.textContent?.trim())).to.deep.equal(expected);
      expect($buttons).to.have.length(18);
    });
    const input = () => label("Buscar tipo de ocorrência");
    input().type("  PRESENCA  ");
    label("Tipos de ocorrência").find("button").should("have.length", 1).and("contain.text", "Presença policial");
    input().clear().type("sem resultado");
    cy.contains("Nenhum tipo encontrado.").should("be.visible");
    label("Limpar busca").click();
    input().should("be.focused").type("incendio").trigger("keydown", { key: "Escape" });
    input().should("have.value", "");
    label("Tipos de ocorrência").find("button").should("have.length", 18);
  });

  it("OCO-04 bloqueia duplicatas durante o envio e permite tentar novamente", () => {
    visitMap();
    rememberAuthor();
    cy.intercept("POST", "/api/incidents").as("create");
    cy.intercept({ method: "POST", url: "/api/incidents", times: 1 }, {
      statusCode: 503, delay: 600, body: {},
    });
    create();
    button(/^Barulho$/).click();
    label("Tipos de ocorrência").should("have.attr", "aria-busy", "true").find("button").should("be.disabled");
    button(/^Barulho$/).trigger("click", { force: true });
    cy.contains("Não foi possível registrar.").should("be.visible");
    pin("Ponto selecionado").should("exist");
    button(/^Barulho$/).click();
    pin("Barulho").should("exist");
    cy.request("/api/incidents").its("body").should("have.length", 1);
  });

  it("OCO-05 e OCO-07 abrem detalhes, enviam mensagem e atualizam a conversa de outro autor", () => {
    cy.clock(Date.now(), ["setInterval", "clearInterval"]);
    seedIncident({ description: "Registro com descrição" }).then(incident => {
      rememberAuthor().then(author => {
        asOtherViewer();
        cy.intercept("GET", path(incident.id)).as("thread");
        visitMap();
        open();
        cy.wait("@thread");
        detail().should("contain.text", "Registro com descrição").and("contain.text", "Registrada em");
        chat();
        cy.contains("Ainda não há mensagens.").should("be.visible");
        label("Mensagem").type("   ").should("have.attr", "maxlength", "500");
        label("Enviar mensagem").should("be.disabled");
        label("Mensagem").clear().type("Relato do visitante");
        failOnce("PATCH", path(incident.id), "Falha no envio");
        label("Enviar mensagem").click();
        detail().find('[role="alert"]').should("contain.text", "Falha no envio");
        label("Mensagem").should("have.value", "Relato do visitante");
        label("Enviar mensagem").click();
        cy.get('[role="log"]').should("contain.text", "Relato do visitante").and("contain.text", "Você");
        actorRequest("PATCH", path(incident.id), author, { action: "message", text: "Resposta do autor" })
          .its("status").should("eq", 200);
        cy.tick(5000);
        cy.get('[role="log"]').contains("li", "Resposta do autor").find("strong").should("not.have.text", "Você");
        detail().contains("button", /Chat\s*2/).should("exist");
        label("Fechar ocorrência").click();
        heading().should("not.exist");
      });
    });
  });

  it("OCO-06 mantém a curtida ao recarregar e reverte a falha de descurtir", () => {
    seedIncident().then(incident => {
      visitMap();
      open();
      cy.get(".incident-description").should("not.exist");
      like().click().should("have.attr", "aria-pressed", "true").and("contain.text", "1");
      cy.reload();
      open();
      like().should("have.attr", "aria-pressed", "true");
      failOnce("PATCH", path(incident.id), "Falha na curtida");
      like().click();
      cy.contains('[role="alert"]', "Falha na curtida").should("be.visible");
      like().should("have.attr", "aria-pressed", "true");
      like().click().should("have.attr", "aria-pressed", "false");
      like().click().should("have.attr", "aria-pressed", "true");
      asOtherViewer();
      cy.reload();
      open();
      like().should("have.attr", "aria-pressed", "false").and("contain.text", "1");
    });
  });

  it("OCO-08 cancela, recupera erro e edita preservando curtidas e mensagens", () => {
    seedIncident({ description: "Descrição inicial" }).then(incident => {
      cy.request("PATCH", path(incident.id), { action: "like", value: true });
      cy.request("PATCH", path(incident.id), { action: "message", text: "Mensagem preservada" });
      visitMap();
      open();
      button("Editar").click();
      detail().find("textarea").should("have.attr", "maxlength", "280").clear().type("Rascunho");
      button("Cancelar").click();
      detail().should("contain.text", "Descrição inicial");
      button("Editar").click();
      detail().find("select").select("fight");
      detail().find("textarea").clear().type("Descrição atualizada");
      failOnce("PUT", path(incident.id), "Falha na edição");
      button("Salvar alterações").click();
      cy.contains('[role="alert"]', "Falha na edição").should("be.visible");
      heading().should("have.text", "Barulho");
      button("Salvar alterações").click();
      pin("Briga").should("exist");
      heading().should("have.text", "Briga");
      detail().should("contain.text", "Descrição atualizada");
      like().should("have.attr", "aria-pressed", "true");
      chat();
      cy.contains('[role="log"]', "Mensagem preservada").should("be.visible");
      button("Editar").click();
      detail().find("textarea").clear();
      button("Salvar alterações").click();
      cy.get(".incident-description").should("not.exist");
    });
  });

  it("OCO-09 cancela e tenta novamente a exclusão após uma falha", () => {
    seedIncident().then(incident => {
      visitMap();
      open();
      detail().contains("button", "Remover").click();
      button("Cancelar").click();
      pin("Barulho").should("exist");
      detail().contains("button", "Remover").click();
      failOnce("DELETE", path(incident.id), "Falha na remoção");
      button("Confirmar remoção").click();
      cy.contains('[role="alert"]', "Falha na remoção").should("be.visible");
      pin("Barulho").should("exist");
      button("Confirmar remoção").click();
      cy.contains("Ocorrência removida.").should("be.visible");
      pin("Barulho").should("not.exist");
      asOtherViewer();
      cy.reload();
      cy.wait("@incidents");
      pin("Barulho").should("not.exist");
    });
  });

  it("OCO-09 retira o detalhe aberto pelo visitante após exclusão pelo autor", () => {
    cy.clock(Date.now(), ["setInterval", "clearInterval"]);
    seedIncident().then(incident => {
      rememberAuthor().then(author => {
        asOtherViewer();
        cy.intercept("GET", path(incident.id)).as("thread");
        visitMap();
        open();
        cy.wait("@thread");
        actorRequest("DELETE", path(incident.id), author).its("status").should("eq", 204);
        cy.tick(5000);
        cy.contains("Esta ocorrência não está mais disponível.").should("be.visible");
        heading().should("not.exist");
      });
    });
  });

  it("OCO-10 desfaz ocultação e isola a escolha após recarregar", () => {
    seedIncident().then(() => {
      rememberAuthor().then(author => {
        asOtherViewer();
        visitMap();
        open();
        button("Ignorar").click();
        pin("Barulho").should("not.exist");
        button("Desfazer").click();
        open();
        button("Ignorar").click();
        pin("Barulho").should("not.exist");
        cy.reload();
        cy.wait("@incidents");
        pin("Barulho").should("not.exist");
        useViewer(author);
        cy.reload();
        pin("Barulho").should("be.visible");
      });
    });
  });

  it("OCO-10 trata falhas de ocultação e restauração e expira o aviso", () => {
    cy.clock(Date.now(), ["setTimeout", "clearTimeout"]);
    seedIncident().then(incident => {
      asOtherViewer();
      visitMap();
      open();
      failOnce("PATCH", path(incident.id), "Falha ao ignorar");
      button("Ignorar").click();
      cy.contains('[role="alert"]', "Falha ao ignorar").should("be.visible");
      button("Ignorar").click();
      button("Desfazer").should("be.visible");
      cy.tick(9001);
      button("Desfazer").should("not.exist");
      cy.request("PATCH", path(incident.id), { action: "ignore", value: false });
      cy.reload();
      open();
      button("Ignorar").click();
      button("Desfazer").should("be.visible");
      failOnce("PATCH", path(incident.id), "Falha ao restaurar");
      button("Desfazer").click();
      cy.contains('[role="status"]', "Falha ao restaurar").should("be.visible");
      pin("Barulho").should("not.exist");
    });
  });

  it("OCO-11 reserva edição e remoção ao autor", () => {
    seedIncident({ description: "Original" }).then(incident => {
      asOtherViewer().then(visitor => {
        visitMap();
        open();
        detail().contains("button", "Editar").should("not.exist");
        detail().contains("button", "Remover").should("not.exist");
        actorRequest("PUT", path(incident.id), visitor, { category: "fight", description: "Outra" })
          .its("status").should("eq", 403);
        actorRequest("DELETE", path(incident.id), visitor).its("status").should("eq", 403);
        cy.request(path(incident.id)).its("body.incident.description").should("eq", "Original");
      });
    });
  });
});
