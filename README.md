# Alerta Jaboatão

Alerta Jaboatão é um protótipo de mapa colaborativo para Jaboatão dos Guararapes, Pernambuco. A aplicação reúne ocorrências registradas no mapa e compara trajetos de carro, a pé e de bicicleta com base na proximidade desses registros.

## Executar localmente

Use Node.js 24, a versão indicada em [.node-version](.node-version), e npm. O manifesto aceita Node.js `^20.19.0 || ^22.12.0 || >=24.0.0`.

```sh
npm ci
npm run dev
```

Abra [localhost:3000](http://localhost:3000). A configuração padrão usa serviços públicos para carregar o mapa, buscar endereços e calcular rotas. Os registros ficam em memória e o servidor inicia sem configuração de ambiente ou banco de dados.

Para ativar o assistente, adicione `GEMINI_KEY=sua_chave` ao arquivo `.env` na raiz e reinicie o servidor. Use uma chave de um projeto no plano gratuito do Google AI Studio. O servidor usa o SDK `@google/genai` com o modelo `gemini-3.5-flash-lite`. [Gerenciar chaves no Google AI Studio](https://aistudio.google.com/api-keys) · [Plano gratuito do Gemini](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite)

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Inicia o servidor de desenvolvimento |
| `npm test` | Executa todos os testes com Vitest |
| `npm run test:unit` | Executa os testes unitários |
| `npm run test:integration` | Executa os testes de integração |
| `npm run test:e2e` | Executa os testes Cypress com Electron em modo headless |
| `npm run test:e2e:open` | Abre a interface do Cypress com a aplicação de testes |
| `npm run typecheck` | Verifica os tipos do TypeScript |
| `npm run build` | Gera o build de produção |
| `npm start` | Serve o build de produção |

### Validação

Execute `npm test`, `npm run typecheck` e `npm run build` para rodar a suíte completa, verificar os tipos e gerar o build de produção.

- Os [testes unitários](tests/unit/) cobrem a validação de ocorrências, a classificação de rotas, os links estáticos e a geolocalização.
- Os [testes de integração](tests/integration/) exercitam os handlers de ocorrências, endereços, rotas e acompanhamento ao vivo. Para o acompanhamento, verificam a atualização da posição, a autorização de alterações e o encerramento por expiração.

Os testes dos serviços externos usam respostas simuladas. A disponibilidade do Photon e do OSRM pode ser verificada na aplicação em execução.

### Testes E2E

Após `npm ci`, execute `npm run test:e2e`. O comando gera o build, inicia a aplicação em `http://localhost:3417` e usa respostas locais para Photon, OSRM e tiles do mapa. Mantenha a porta 3417 livre durante a execução. A primeira instalação do Cypress baixa o navegador usado pela suíte.

Os testes estão em [cypress/e2e](cypress/e2e) e seus títulos incluem os IDs do plano. Para rodar um arquivo, use `npm run test:e2e -- --spec cypress/e2e/live.cy.ts`. O cenário de expiração ao vivo usa o relógio do servidor e leva cerca de 45 segundos.

Cada teste de UI aprovado salva um PNG da tela final em `cypress/screenshots/AAAA-MM-DD/HH-MM-SS-id/arquivo.cy.ts/`. A data e a hora usam o fuso de São Paulo. Cada execução headless e cada repetição de um arquivo no modo interativo recebe uma pasta nova, e as capturas anteriores são preservadas. O Cypress também mantém as capturas automáticas de falhas em modo headless. As imagens ficam como artefatos locais ignorados pelo Git.

## Usar a aplicação

- **Mapa.** Cada ocorrência aparece com um círculo de 150 m de raio na cor da categoria, o mesmo raio usado para comparar trajetos. Clique ou toque em um ponto dentro do município e escolha uma categoria para registrar a ocorrência. Abra um marcador para ver os detalhes, curtir ou enviar mensagens. Quem registrou pode editar a categoria e a descrição ou excluir o registro. Outras pessoas podem ocultá-lo para o próprio navegador e desfazer a ação.
- **Minha localização.** Use o botão com a seta de navegação no mapa e conceda a permissão solicitada pelo navegador. O ponto azul acompanha sua posição dentro e fora de Jaboatão. Use o mesmo botão para interromper o acompanhamento. O recurso exige HTTPS ou acesso local por `localhost`.
- **Diário.** Exibe as ocorrências do dia no fuso `America/Recife` e atualiza a lista a cada 30 segundos enquanto está aberto. Quando o Photon encontra uma referência próxima, ela aparece ao lado do horário. Selecionar um registro leva ao ponto original no mapa.
- **Assistente.** Abra o menu pelo ícone flutuante no mapa. Arraste o ícone, ou use as setas com o botão em foco, para mudar de canto. A cada pergunta, o servidor monta um prompt XML com exemplos fictícios e até 20 ocorrências visíveis mais recentes das últimas 24 horas, com categoria, horário do registro e bairro quando disponível. A pergunta e as mensagens recentes da conversa também são enviadas ao Gemini. Evite incluir dados pessoais. [Política de dados do plano gratuito](https://aistudio.google.com/docs/terms#data-use-unpaid)
- **Rotas.** Escolha um destino em Jaboatão, compare alternativas e selecione um trajeto. Com a localização ativa, o planejador usa sua posição como origem por padrão, inclusive fora do município. Desmarque **Usar minha localização como origem** para buscar um endereço de origem em Jaboatão. Use **Copiar link** para compartilhar o trajeto escolhido.
- **Acompanhamento ao vivo.** Com a rota escolhida e sua localização ativa, selecione **Compartilhar ao vivo** e envie o link de acompanhamento. Quem tiver o link pode ver a rota e sua posição atual. Mantenha a página, o resumo da rota e a localização ativos. Use **Encerrar compartilhamento** para desligar o link. A sessão também é encerrada ao sair do resumo ou quando a localização fica indisponível. Se a página perder a conexão antes de encerrar, a sessão expira após 45 segundos sem atualização.
- **Emergência.** Em telas de até 540 px, o atalho **Emergência 190** abre o discador com o número preenchido.

Para comparar trajetos, o servidor conta os registros visíveis a menos de 150 m de cada rota. A ordenação usa primeiro o menor número de ocorrências, depois a menor exposição ponderada por distância e recência e, por fim, o menor tempo estimado. Se todas as alternativas iniciais passarem perto de ocorrências, o servidor tenta gerar desvios com pontos de passagem. A comparação reflete os registros disponíveis no momento da consulta.

## Arquitetura e armazenamento

| Caminho | Responsabilidade |
| --- | --- |
| [app/](app/) | Páginas, layout, estilos globais e handlers HTTP do Next.js App Router |
| [src/components/](src/components/) | Interface React com Leaflet, Tailwind CSS e Lucide |
| [src/lib/](src/lib/) | Tipos, regras de território, geolocalização e links de rota |
| [src/server/](src/server/) | Repositório de ocorrências, sessão anônima, geocodificação e classificação de rotas |
| [src/data/jaboatao.json](src/data/jaboatao.json) | Polígono usado para validar pontos dentro do município |
| [proxy.ts](proxy.ts) | Inicialização do cookie ao abrir a página principal |
| [prisma/schema.prisma](prisma/schema.prisma) | Modelo PostgreSQL para persistência futura |
| [tests/](tests/) | Testes unitários e de integração |

O repositório atual compartilha ocorrências, curtidas, mensagens e escolhas de ocultação entre requisições atendidas pelo mesmo processo. Reiniciar o processo apaga esses dados, e cada instância mantém sua própria cópia. O schema Prisma referencia `DATABASE_URL` para PostgreSQL. A aplicação em execução usa exclusivamente o repositório em memória.

As sessões ao vivo também ficam em memória. O acompanhamento exige que as requisições de quem compartilha e de quem acompanha cheguem ao mesmo processo. O mapa mostra a posição mais recente, a rota e as ocorrências visíveis para aquele navegador a menos de 150 m do trajeto. Toque no marcador para consultar a categoria, o horário e a descrição.

### Serviços externos

As variáveis abaixo são opcionais e podem ser definidas em `.env.local` na raiz.

| Variável | Uso | Padrão |
| --- | --- | --- |
| `PHOTON_URL` | URL base para busca de endereços e geocodificação reversa | `https://photon.komoot.io` |
| `OSRM_URL` | URL base do OSRM para carro | `https://routing.openstreetmap.de/routed-car` |
| `OSRM_FOOT_URL` | URL base do OSRM para caminhada | `https://routing.openstreetmap.de/routed-foot` |
| `OSRM_BIKE_URL` | URL base do OSRM para bicicleta | `https://routing.openstreetmap.de/routed-bike` |

O mapa interativo carrega imagens de ruas do OpenStreetMap. O contorno municipal vem da malha simplificada do GeoData BR, código IBGE 2607901. [Créditos do OpenStreetMap](https://www.openstreetmap.org/copyright) · [Malha do GeoData BR](https://github.com/tbrugz/geodata-br/blob/master/geojson/geojs-26-mun.json)

## API HTTP

Os exemplos usam caminhos relativos à aplicação. Envie corpos de `POST`, `PUT` e `PATCH` em JSON com `Content-Type: application/json`. Respostas com corpo usam JSON. Os erros usam `{"error":"mensagem"}`.

| Método | Caminho | Resultado |
| --- | --- | --- |
| `GET` | [`/api/incidents`](#get-apiincidents) | Lista ocorrências visíveis |
| `POST` | [`/api/incidents`](#post-apiincidents) | Cria uma ocorrência |
| `GET` | [`/api/incidents/{id}`](#get-apiincidentsid) | Consulta uma ocorrência e suas mensagens |
| `PUT` | [`/api/incidents/{id}`](#put-apiincidentsid) | Substitui a categoria e a descrição |
| `PATCH` | [`/api/incidents/{id}`](#patch-apiincidentsid) | Atualiza curtidas, mensagens ou ocultação |
| `DELETE` | [`/api/incidents/{id}`](#delete-apiincidentsid) | Exclui a ocorrência |
| `POST` | [`/api/chat`](#post-apichat) | Responde a perguntas sobre ocorrências recentes |
| `POST` | [`/api/route-addresses`](#post-apiroute-addresses) | Busca endereços em Jaboatão |
| `POST` | [`/api/routes`](#post-apiroutes) | Calcula e ordena alternativas de trajeto |
| `POST` | [`/api/live-routes`](#post-apilive-routes) | Inicia um acompanhamento |
| `GET` | [`/api/live-routes/{id}`](#get-apilive-routesid) | Consulta a posição atual e, opcionalmente, o trajeto e as ocorrências próximas |
| `PATCH` | [`/api/live-routes/{id}`](#patch-apilive-routesid) | Atualiza a posição |
| `DELETE` | [`/api/live-routes/{id}`](#delete-apilive-routesid) | Encerra o acompanhamento |

### Sessão e formatos comuns

O cookie anônimo `alerta_viewer` identifica o navegador para autoria, curtidas e ocultação. A página inicial, os dois `GET` de ocorrências e a criação bem-sucedida emitem o cookie quando necessário. Clientes HTTP devem guardar o `Set-Cookie` e enviar o cookie nas requisições seguintes. Em `/api/incidents/{id}`, os métodos `PUT`, `PATCH` e `DELETE` exigem uma sessão válida e retornam `403` quando `Sec-Fetch-Site` indica `cross-site` ou `same-site`. O cálculo de rotas aceita o cookie para excluir os registros ocultados por essa sessão. Em `/api/live-routes/{id}`, a credencial de escrita é o cabeçalho `X-Live-Secret`.

- **Ponto** — objeto `{"lat":-8.145,"lng":-35.005}`, com latitude e longitude numéricas em graus decimais.
- **Ocorrência** — objeto com `id` (UUID), `lat`, `lng`, `category`, `description`, `createdAt` (data e hora ISO 8601 em UTC), `isOwner` e `likedByMe` (booleanos), `likeCount` e `messageCount` (contagens). `locationLabel` é uma string opcional retornada na consulta do Diário.
- **Conversa** — objeto `{"incident": <ocorrência>, "messages": [...]}`. Cada mensagem contém `id` (UUID), `author` (pseudônimo na conversa), `isMine` (booleano), `text` e `createdAt` (data e hora ISO 8601 em UTC).

### GET /api/incidents

Retorna `200` com um array de ocorrências da mais recente para a mais antiga, excluindo as ocultadas pela sessão. Uma lista vazia é representada por `[]`.

Use `?diary=1` para incluir `locationLabel` nos registros do dia em `America/Recife` quando houver uma referência disponível. A API ainda retorna os registros de outras datas. A interface do Diário filtra a lista pelo dia atual.

### POST /api/incidents

```json
{
  "lat": -8.145,
  "lng": -35.005,
  "category": "noise",
  "description": "Barulho relatado neste ponto"
}
```

`lat` e `lng` devem formar um ponto dentro do município. `category` deve ser um dos códigos abaixo. `description` é opcional, tem limite de 280 caracteres antes de remover espaços nas extremidades e assume `""` quando omitida.

Retorna `201` com a ocorrência criada ou `400` para JSON ou campos inválidos.

| Código | Categoria | Código | Categoria |
| --- | --- | --- | --- |
| `robbery` | Assalto | `drug_trafficking` | Tráfico de drogas |
| `incident` | Incidente | `drug_use` | Consumo de drogas |
| `police` | Presença policial | `bus_fire` | Incêndio em ônibus |
| `homicide` | Homicídio | `bus_robbery` | Assalto a ônibus |
| `disorder` | Desordem | `kidnapping` | Sequestro |
| `noise` | Barulho | `bank_explosion` | Explosão em banco |
| `fight` | Briga | `other` | Outro crime |
| `mass_robbery` | Arrastão | `protest` | Protesto |
| `dangerous_animals` | Animais perigosos | `vehicle_dismantling` | Desmanche |

### GET /api/incidents/{id}

Substitua `{id}` pelo UUID da ocorrência. Retorna `200` com a conversa ou `404` se a ocorrência estiver ausente ou oculta para a sessão.

### PUT /api/incidents/{id}

O autor substitui os dois campos editáveis da ocorrência. Envie `category` com uma categoria válida e `description` com até 280 caracteres antes de remover espaços nas extremidades. Ambos os campos são obrigatórios. Para limpar a descrição, envie `""`. Repetir a mesma requisição mantém o resultado da edição e preserva as curtidas e mensagens existentes.

```json
{"category":"noise","description":"Descrição atualizada"}
```

Retorna `200` com a conversa atualizada, `400` para corpo inválido, `403` para sessão sem permissão ou `404` para ocorrência ausente ou oculta.

### PATCH /api/incidents/{id}

Substitua `{id}` pelo UUID da ocorrência e envie uma ação por requisição.

| Ação | Exemplo de corpo | Regra |
| --- | --- | --- |
| Curtir ou descurtir | `{"action":"like","value":true}` | `value` é booleano. Use `false` para remover a curtida |
| Ocultar ou desfazer | `{"action":"ignore","value":true}` | `value` é booleano. Use `false` para voltar a exibir. Disponível para quem não criou a ocorrência |
| Comentar | `{"action":"message","text":"Mensagem de exemplo"}` | Texto de 1 a 500 caracteres após remover espaços nas extremidades |

- `200` com a conversa atualizada.
- `400` para corpo ou ação inválida.
- `403` para sessão ou ação sem permissão.
- `404` para ocorrência ausente ou oculta. A ação `ignore` também funciona em ocorrências ocultas, permitindo desfazer a ocultação.

### DELETE /api/incidents/{id}

O autor exclui a ocorrência com uma requisição sem corpo. Retorna `204` sem corpo em caso de sucesso, `403` para sessão sem permissão ou `404` para ocorrência ausente ou oculta.

### POST /api/chat

```json
{"message":"O que foi registrado hoje em Prazeres?"}
```

`message` aceita até 1000 caracteres. `history` é opcional e recebe mensagens no formato `{role, text}`, em pares `user` e `assistant` do mais antigo ao mais recente. Envie o cookie `alerta_viewer` para aplicar as preferências de ocultação da sessão.

Retorna `200` com `{reply}`, `400` para pergunta ou histórico inválido, `415` para requisição sem `Content-Type: application/json`, `429` quando a cota do Gemini é atingida, `502` quando o Gemini não retorna texto ou `503` quando o assistente está indisponível.

### POST /api/route-addresses

```json
{"query":"Avenida Barreto de Menezes"}
```

`query` deve ter de 3 a 160 caracteres após remover espaços nas extremidades. A busca usa Photon e filtra os resultados pelo limite municipal.

Retorna `200` com até cinco objetos no formato `{lat, lng, label}`. `label` é o endereço de exibição e `[]` indica ausência de resultados. Retorna `400` para consulta inválida ou `503` se o serviço de busca estiver indisponível.

### POST /api/routes

```json
{
  "origin": {"lat": -8.145, "lng": -35.005},
  "destination": {"lat": -8.151, "lng": -35.01},
  "mode": "car"
}
```

`origin` pode ser qualquer ponto geográfico válido. `destination` deve ser um ponto dentro de Jaboatão e diferente da origem. Modos aceitos são `car` (carro), `foot` (a pé) e `bike` (bicicleta). O padrão é `car`.

Em uma resposta `200`, os campos `path`, `distance`, `duration` e `nearbyIncidents` no nível superior descrevem a melhor rota. `options` contém as alternativas ordenadas, com esses mesmos quatro campos em cada item. `comparedRoutes` é o número de alternativas em `options`.

| Campo | Formato |
| --- | --- |
| `path` | Array ordenado de pontos `{lat, lng}` |
| `distance` | Distância em metros |
| `duration` | Tempo estimado em segundos |
| `nearbyIncidents` | Quantidade de ocorrências visíveis a menos de 150 m do trajeto |

Retorna `400` para coordenadas ou modo inválidos, `404` quando não encontra um trajeto para o modo escolhido, `429` quando o limitador local impede uma consulta ao servidor público e `503` quando o serviço de rotas está indisponível.

### POST /api/live-routes

Cria uma sessão com validade inicial de 45 segundos. Envie `route` e `position` no corpo JSON. Para obter `route` a partir de um link estático, use `new URL(link).hash`, incluindo o prefixo `#rota=`. O destino deve estar em Jaboatão. A posição atual pode estar fora do município.

Retorna `201` com `{id, secret}` (dois UUIDs) ou `400` para rota ou posição inválida. O link público usa apenas o identificador em `/ao-vivo/{id}`. Guarde `secret` no cliente que publica as atualizações.

### GET /api/live-routes/{id}

Qualquer cliente com o identificador pode consultar a sessão. Retorna `200` com `Cache-Control: no-store`. A leitura preserva o prazo de expiração. Sessões ausentes, encerradas ou expiradas retornam `404`.

| Consulta | Campos na resposta |
| --- | --- |
| Sem parâmetros | `position` com a última posição publicada, no formato `{lat, lng}` |
| `?route=1` | `position` e `route`, o fragmento enviado na criação |
| `?incidents=1` | `position` e `incidents`, um array de ocorrências recalculado a cada consulta |
| `?route=1&incidents=1` | `position`, `route` e `incidents` |

O filtro considera ocorrências a menos de 150 m de qualquer trecho da rota. Se a consulta incluir o cookie `alerta_viewer`, o resultado exclui as ocorrências ocultadas por quem consulta. O array é `[]` quando nenhum registro corresponde ao filtro.

### PATCH /api/live-routes/{id}

Envie a nova posição como `{lat, lng}` e a credencial no cabeçalho `X-Live-Secret`. Retorna `204` e renova a sessão por 45 segundos. Posições inválidas retornam `400`. Sessões indisponíveis ou credenciais incorretas retornam `404`.

```http
PATCH /api/live-routes/{id} HTTP/1.1
Content-Type: application/json
X-Live-Secret: {secret}

{"lat":-8.145,"lng":-35.005}
```

### DELETE /api/live-routes/{id}

Envie `X-Live-Secret` para encerrar a sessão. Retorna `204` em caso de sucesso ou `404` para sessão indisponível ou credencial incorreta.
