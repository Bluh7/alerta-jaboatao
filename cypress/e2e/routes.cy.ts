import {
  asOtherViewer, button, expandRoute, geo, gps, label, mockClipboard, pin,
  planRoute, routeHash, routeLauncher, seedIncident, visitMap,
} from "../support/helpers";
import type { RouteResult } from "../../src/lib/trip";

const origin = () => cy.get("#route-origin");
const destination = () => cy.get("#route-destination");
const comparison = () => cy.get("#route-summary-heading");
const routePath = "/api/routes";
const addressesPath = "/api/route-addresses";
const draw = () => cy.get("#route-planner").contains("button", "Traçar rota");
const select = () => button("Escolher esta rota");
const choose = (text: string) => cy.contains('[role="option"]', text);
const drawn = () => cy.get('.leaflet-overlay-pane path[stroke="#1767d6"]');

describe("Planejamento de rota", () => {
  it("ROT-01 planeja por clique e teclado e fecha sugestões e diálogo", () => {
    visitMap();
    cy.intercept("POST", routePath).as("route");
    routeLauncher().click();
    origin().type("Rua Origem");
    choose(geo.origin.label).should("be.visible");
    origin().trigger("keydown", { key: "Escape" }).should("have.attr", "aria-expanded", "false");
    destination().focus();
    origin().focus();
    choose(geo.origin.label).click();
    destination().type("Rua Destino");
    choose(geo.destination.label).should("be.visible");
    destination().trigger("keydown", { key: "ArrowDown" }).should("have.attr", "aria-activedescendant", "route-destination-suggestions-0");
    destination().trigger("keydown", { key: "Enter" }).should("have.value", geo.destination.label);
    draw().click();
    cy.wait("@route").its("request.body").should("deep.equal", { origin: geo.origin, destination: geo.destination, mode: "car" });
    comparison().should("have.text", "Rota 1 de 2");
    label("Fechar comparação").click();
    routeLauncher().click();
    cy.get<HTMLDialogElement>("#route-planner").then($dialog => $dialog[0].requestClose());
    cy.get("#route-planner").should("not.exist");
  });

  it("ROT-02 e ROT-03 limitam sugestões válidas e exigem seleção entre endereços ambíguos", () => {
    visitMap();
    cy.intercept("POST", addressesPath).as("addresses");
    routeLauncher().click();
    origin().type("ru");
    origin().should("have.attr", "minlength", "3");
    cy.get("@addresses.all").should("have.length", 0);
    origin().clear().type("ambíguo");
    cy.wait("@addresses").its("response.body").should("have.length", 5);
    label("Sugestões para origem").find('[role="option"]').should("have.length", 5)
      .and("not.contain.text", "Endereço externo");
    choose("Rua Repetida").should("have.length", 1);
    draw().should("be.disabled");
    destination().type("Rua Destino");
    label("Endereços encontrados para origem").select("0");
    draw().should("be.enabled").click();
    comparison().should("have.text", "Rota 1 de 2");
  });

  for (const { from, to, feedback } of [
    { from: "origem ausente", to: "Rua Destino", feedback: "Origem não encontrada em Jaboatão." },
    { from: "Rua Origem", to: "destino ausente", feedback: "Destino não encontrado em Jaboatão." },
    { from: "origem ausente", to: "destino ausente", feedback: "Não encontramos os endereços em Jaboatão." },
  ]) {
    it(`ROT-02 informa ${feedback}`, () => {
      visitMap();
      planRoute(from, to);
      cy.contains('[role="alert"]', feedback).should("be.visible");
    });
  }

  it("ROT-03 troca a escolha anterior e ignora resposta atrasada ou de diálogo fechado", () => {
    visitMap();
    routeLauncher().click();
    origin().type("Rua Origem");
    choose(geo.origin.label).click();
    const pending = cy.stub().as("pendingAddress");
    cy.intercept("POST", addressesPath, req => {
      if (req.body.query === "consulta antiga" || req.body.query === "consulta cancelada") {
        pending(req.body.query);
        req.reply({ delay: 1000, body: [{ ...geo.origin, label: "Sugestão obsoleta" }] });
      }
    });
    origin().clear().type("consulta antiga");
    cy.get("@pendingAddress").should("have.been.calledWith", "consulta antiga");
    origin().clear().type("Rua Destino");
    choose(geo.destination.label).should("be.visible");
    choose("Sugestão obsoleta").should("not.exist");
    origin().clear().type("consulta cancelada");
    cy.get("@pendingAddress").should("have.been.calledWith", "consulta cancelada");
    label("Fechar planejador de rota").click();
    cy.get("#route-planner").should("not.exist");
    routeLauncher().click();
    cy.get("#route-planner").should("be.visible");
    choose("Sugestão obsoleta").should("not.exist");
  });

  it("ROT-03 informa falha do Photon nas sugestões e no envio, depois recupera", () => {
    visitMap();
    routeLauncher().click();
    origin().type("falha");
    cy.contains("Sugestões indisponíveis no momento.").should("be.visible");
    destination().type("Rua Destino");
    draw().click();
    cy.get("#route-planner [role=alert]").should("be.visible");
    origin().clear().type("Rua Origem");
    draw().click();
    comparison().should("have.text", "Rota 1 de 2");
  });

  it("ROT-04 usa posição externa como origem e oferece busca manual ao desmarcar ou perder sinal", () => {
    const location = gps();
    visitMap("/", location.install);
    cy.intercept("POST", routePath).as("route");
    label("Minha localização").click();
    location.emit(geo.outside);
    cy.get(".user-location-marker").should("exist");
    routeLauncher().click();
    cy.get("#route-planner input[type=checkbox]").should("be.checked").uncheck();
    origin().should("be.visible");
    cy.get("#route-planner input[type=checkbox]").check();
    origin().should("not.exist");
    location.fail(2);
    origin().should("be.visible");
    location.emit(geo.outside);
    origin().should("not.exist");
    destination().type("Rua Destino");
    draw().click();
    cy.wait("@route").its("request.body.origin").should("deep.include", geo.outside);
    drawn().should("exist");
  });

  it("ROT-04 trata origem igual ao destino e permite corrigir", () => {
    visitMap();
    planRoute("Rua Origem", "Rua Origem");
    cy.contains('[role="alert"]', "Escolha um destino diferente da origem.").should("be.visible");
    label("Fechar comparação").click();
    planRoute();
    drawn().should("exist");
  });
});

describe("Comparação e compartilhamento de rota", () => {
  it("ROT-05 e ROT-06 alternam modos e alternativas, com métricas e traçados próprios", () => {
    visitMap();
    cy.intercept("POST", routePath).as("route");
    planRoute();
    cy.wait("@route").its("request.body.mode").should("eq", "car");
    comparison().should("have.text", "Rota 1 de 2");
    button(/^Carro$/).should("have.attr", "aria-pressed", "true");
    cy.contains("Recomendada").should("be.visible");
    cy.contains("5 min").should("be.visible");
    cy.contains("1,5 km").should("be.visible");
    cy.contains("Nenhum registro a até 150 m").should("be.visible");
    label("Ver rota anterior").should("be.disabled");
    drawn().invoke("attr", "d").then(first => {
      label("Ver próxima rota").click();
      comparison().should("have.text", "Rota 2 de 2");
      drawn().should("not.have.attr", "d", first);
    });
    label("Ver próxima rota").should("be.disabled");
    label("Ver rota anterior").click();
    button(/^A pé$/).click();
    cy.wait("@route").its("request.body.mode").should("eq", "foot");
    cy.contains("20 min").should("be.visible");
    button(/^A pé$/).should("have.attr", "aria-pressed", "true");
    button(/^Bicicleta$/).click();
    cy.wait("@route").its("request.body.mode").should("eq", "bike");
    button(/^Bicicleta$/).should("have.attr", "aria-pressed", "true");
    cy.contains("10 min").should("be.visible");
    comparison().should("have.text", "Rota 1 de 1");
    label("Ver próxima rota").should("not.exist");
  });

  it("ROT-05 descarta resposta do modo anterior após troca rápida", () => {
    const oldRoute = { path: [geo.origin, geo.destination], distance: 2200, duration: 1200, nearbyIncidents: 0 };
    const readWalking = cy.stub().as("readWalking");
    readWalking.resolves({ ...oldRoute, comparedRoutes: 1, options: [oldRoute] });
    let walkingSignal: AbortSignal | null | undefined;
    let releaseWalking: () => void;
    cy.intercept("POST", routePath, req => {
      if (req.body.mode === "bike") req.alias = "bikeRoute";
    });
    visitMap("/", window => {
      const originalFetch = window.fetch.bind(window);
      cy.stub(window, "fetch").callsFake((input: RequestInfo | URL, init?: RequestInit) => {
        if (input !== routePath || JSON.parse(init?.body as string).mode !== "foot") return originalFetch(input, init);
        walkingSignal = init?.signal;
        return new Promise(resolve => {
          releaseWalking = () => resolve({ ok: true, json: readWalking });
        });
      });
    });
    planRoute();
    comparison().should("have.text", "Rota 1 de 2");
    button(/^A pé$/).click();
    cy.contains("Calculando rotas · A pé").should("be.visible");
    cy.wrap(null).should(() => expect(walkingSignal).to.exist);
    button(/^Bicicleta$/).click();
    cy.wait("@bikeRoute").its("response.statusCode").should("eq", 200);
    cy.then(() => {
      expect(walkingSignal?.aborted).to.equal(true);
      releaseWalking();
    });
    cy.get("@readWalking").should("have.been.calledOnce");
    cy.get(".route-stats-heading").should("contain.text", "10 min");
    button(/^Bicicleta$/).should("have.attr", "aria-pressed", "true");
  });

  it("ROT-07 recomenda menor exposição, busca desvio e exclui ocorrência ocultada só para o visitante", () => {
    seedIncident({ ...geo.near }).then(incident => {
      seedIncident({ ...geo.near, category: "fight", lng: geo.near.lng + 0.0003 });
      cy.intercept("POST", routePath).as("route");
      visitMap();
      planRoute();
      cy.wait<unknown, RouteResult>("@route").then(({ response }) => {
        expect(response?.body.options.map(option => option.nearbyIncidents)).to.deep.equal([0, 2]);
      });
      cy.contains("8 min").should("be.visible");
      label("Ver próxima rota").click();
      cy.contains("2 registros próximos").should("be.visible");
      button(/^Bicicleta$/).click();
      cy.wait("@route").its("response.body.comparedRoutes").should("eq", 2);
      cy.contains("Nenhum registro").should("be.visible");
      label("Fechar comparação").click();
      asOtherViewer();
      cy.request("PATCH", `/api/incidents/${incident.id}`, { action: "ignore", value: true });
      cy.reload();
      pin("Barulho").should("not.exist");
      planRoute();
      cy.wait("@route").its("response.body.options.1.nearbyIncidents").should("eq", 1);
      label("Ver próxima rota").click();
      cy.contains("1 registro próximo").should("be.visible");
    });
  });

  for (const [status, message] of [
    [404, "Nenhuma rota encontrada para esse modo de transporte."],
    [429, "Aguarde um instante e tente novamente."],
    [503, "O serviço de rotas está indisponível. Tente novamente."],
  ] as const) {
    it(`ROT-08 informa HTTP ${status} e recupera ao tentar novamente`, () => {
      visitMap();
      cy.intercept({ method: "POST", url: routePath, times: 1 }, { statusCode: status, body: { error: message }, delay: 450 });
      planRoute();
      cy.contains("Calculando rotas · Carro").should("be.visible");
      cy.contains('[role="alert"]', message).should("be.visible");
      button("Tentar novamente").click();
      drawn().should("exist");
    });
  }

  it("ROT-08 recupera de falha de rede no cálculo", () => {
    visitMap();
    let offline = true;
    cy.intercept("POST", routePath, req => {
      if (offline) req.destroy();
      else req.continue();
    });
    planRoute();
    cy.get(".route-summary [role=alert]").should("be.visible");
    cy.then(() => { offline = false; });
    button("Tentar novamente").click();
    drawn().should("exist");
  });

  it("ROT-09 confirma, recolhe, restaura ao cancelar e remove a rota", () => {
    visitMap();
    planRoute();
    label("Ver próxima rota").click();
    select().click();
    label("Expandir opções da rota").should("have.attr", "aria-expanded", "false");
    expandRoute();
    cy.contains("8 min").should("be.visible");
    label("Recolher opções da rota").click();
    cy.get("#route-summary-options").should("have.attr", "inert");
    expandRoute();
    button(/^Comparar rotas$/).click();
    button(/^Bicicleta$/).click();
    cy.contains("10 min").should("be.visible");
    label("Fechar comparação").click();
    comparison().should("have.text", "Rota escolhida");
    cy.contains("8 min").should("be.visible");
    label("Mostrar rota inteira").click();
    label("Remover rota do mapa").click();
    drawn().should("not.exist");
    comparison().should("not.exist");
  });

  it("ROT-10 copia a rota e reabre em outra sessão sem recalcular", () => {
    visitMap("/", window => mockClipboard(window));
    cy.intercept("POST", routePath).as("route");
    planRoute();
    button(/^Bicicleta$/).click();
    cy.contains("10 min").should("be.visible");
    select().click();
    expandRoute();
    button(/^Copiar link$/).click();
    cy.contains("Link da rota copiado.").should("be.visible");
    cy.get<sinon.SinonStub>("@clipboard").then(clipboard => {
      const hash = new URL(clipboard.firstCall.args[0]).hash;
      expect(hash).to.match(/^#rota=/);
      asOtherViewer();
      visitMap(`/?view=shared${hash}`);
      expandRoute();
      cy.get(".route-confirmed-mode").should("have.text", "Bicicleta");
      cy.contains("10 min").should("be.visible");
      cy.contains(geo.destination.label).should("exist");
      drawn().should("exist");
      cy.get("@route.all").should("have.length", 2);
    });
  });

  it("ROT-10 oferece cópia manual e lida com hash inválido, substituído e removido", () => {
    visitMap("/#rota=inválida", window => mockClipboard(window, true));
    cy.contains("O link da rota está incompleto ou inválido.").should("be.visible");
    cy.window().then(window => { window.location.hash = routeHash("foot", { ...geo.outside, label: "Origem externa" }); });
    expandRoute();
    button(/^Copiar link$/).click();
    label("Link da rota").should("have.attr", "readonly");
    label("Link da rota").invoke("val").should("contain", "#rota=");
    cy.get(".route-confirmed-mode").should("have.text", "A pé");
    label("Remover rota do mapa").click();
    cy.location("hash").should("eq", "");
    cy.window().then(window => { window.location.hash = routeHash(); });
    label("Expandir opções da rota").should("exist");
    planRoute();
    cy.location("hash").should("eq", "");
  });
});
