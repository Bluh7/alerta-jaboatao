# Alerta Jaboatão

Alerta Jaboatão é um protótipo de mapa colaborativo para Jaboatão dos Guararapes, Pernambuco. A aplicação reúne ocorrências registradas no mapa e compara trajetos de carro, a pé e de bicicleta com base na proximidade desses registros.

## Executar localmente

Use Node.js 24, a versão indicada em [.node-version](.node-version), e npm. O manifesto aceita Node.js `^20.19.0 || ^22.12.0 || >=24.0.0`.

```sh
npm ci
npm run dev
```

Abra [localhost:3000](http://localhost:3000). A configuração padrão usa serviços públicos para carregar o mapa, buscar endereços e calcular rotas. Os registros ficam em memória e o servidor inicia sem configuração de ambiente ou banco de dados.

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Inicia o servidor de desenvolvimento |
| `npm test` | Executa todos os testes com Vitest |
| `npm run test:unit` | Executa os testes unitários |
| `npm run test:integration` | Executa os testes de integração |
| `npm run typecheck` | Verifica os tipos do TypeScript |
| `npm run build` | Gera o build de produção |
| `npm start` | Serve o build de produção |

### Validação

Execute `npm test`, `npm run typecheck` e `npm run build` para rodar a suíte completa, verificar os tipos e gerar o build de produção.

- Os [testes unitários](tests/unit/) cobrem a validação de ocorrências, a classificação e o compartilhamento de rotas e a exportação HTML. Na edição, verificam os campos obrigatórios, a descrição vazia e o limite de 280 caracteres.
- Os [testes de integração](tests/integration/) exercitam os handlers de ocorrências, endereços, rotas e exportação. O fluxo de ocorrências verifica autoria, sessão, rejeição de requisições de outra origem, repetição de `PUT` sem alterar a conversa e os retornos `204` na exclusão e `404` ao tentar editar um registro já excluído.

Os testes dos serviços externos usam respostas simuladas. A disponibilidade do Photon, do OSRM e do Overpass pode ser verificada na aplicação em execução.

## Usar a aplicação

- **Mapa.** Clique ou toque em um ponto dentro do município e escolha uma categoria para registrar a ocorrência. Abra um marcador para ver os detalhes, curtir ou enviar mensagens. Quem registrou pode editar a categoria e a descrição ou excluir o registro. Outras pessoas podem ocultá-lo para o próprio navegador e desfazer a ação.
- **Minha localização.** Use o botão com a seta de navegação no mapa e conceda a permissão solicitada pelo navegador. O ponto azul acompanha sua posição enquanto ela estiver dentro de Jaboatão. Fora do município, o mapa oculta o ponto e exibe um aviso de cobertura. Use o mesmo botão para interromper o acompanhamento. A aplicação processa a posição no navegador. O recurso exige HTTPS ou acesso local por `localhost`.
- **Diário.** Exibe as ocorrências do dia no fuso `America/Recife` e atualiza a lista a cada 30 segundos enquanto está aberto. Quando o Photon encontra uma referência próxima, ela aparece ao lado do horário. Selecionar um registro leva ao ponto original no mapa.
- **Rotas.** Escolha origem e destino em Jaboatão, compare alternativas e selecione um trajeto. A rota escolhida pode ser compartilhada por link ou exportada como arquivo HTML que abre offline. Se a consulta de ruas para o arquivo falhar, o HTML ainda inclui o trajeto e o contorno municipal.
- **Emergência.** Em telas de até 540 px, o atalho **Emergência 190** abre o discador com o número preenchido.

Para comparar trajetos, o servidor conta os registros visíveis a menos de 150 m de cada rota. A ordenação usa primeiro o menor número de ocorrências, depois a menor exposição ponderada por distância e recência e, por fim, o menor tempo estimado. Se todas as alternativas iniciais passarem perto de ocorrências, o servidor tenta gerar desvios com pontos de passagem. A comparação reflete os registros disponíveis no momento da consulta.

## Arquitetura e armazenamento

| Caminho | Responsabilidade |
| --- | --- |
| [app/](app/) | Páginas, layout, estilos globais e handlers HTTP do Next.js App Router |
| [src/components/](src/components/) | Interface React com Leaflet, Tailwind CSS e Lucide |
| [src/lib/](src/lib/) | Tipos, regras de território, compartilhamento e exportação de rotas |
| [src/server/](src/server/) | Repositório de ocorrências, sessão anônima, geocodificação e classificação de rotas |
| [src/data/jaboatao.json](src/data/jaboatao.json) | Polígono usado para validar pontos dentro do município |
| [proxy.ts](proxy.ts) | Inicialização do cookie ao abrir a página principal |
| [prisma/schema.prisma](prisma/schema.prisma) | Modelo PostgreSQL para persistência futura |
| [tests/](tests/) | Testes unitários e de integração |

O repositório atual compartilha ocorrências, curtidas, mensagens e escolhas de ocultação entre requisições atendidas pelo mesmo processo. Reiniciar o processo apaga esses dados, e cada instância mantém sua própria cópia. O schema Prisma referencia `DATABASE_URL` para PostgreSQL. A aplicação em execução usa exclusivamente o repositório em memória.

### Serviços externos

As variáveis abaixo são opcionais e podem ser definidas em `.env.local` na raiz.

| Variável | Uso | Padrão |
| --- | --- | --- |
| `PHOTON_URL` | URL base para busca de endereços e geocodificação reversa | `https://photon.komoot.io` |
| `OSRM_URL` | URL base do OSRM para carro | `https://routing.openstreetmap.de/routed-car` |
| `OSRM_FOOT_URL` | URL base do OSRM para caminhada | `https://routing.openstreetmap.de/routed-foot` |
| `OSRM_BIKE_URL` | URL base do OSRM para bicicleta | `https://routing.openstreetmap.de/routed-bike` |
| `OVERPASS_URL` | URL completa do interpretador Overpass para obter ruas para exportação | `https://overpass.private.coffee/api/interpreter`, com `https://overpass-api.de/api/interpreter` como alternativa. As instâncias públicas também servem como alternativas quando há uma URL personalizada. |

O mapa interativo carrega imagens de ruas do OpenStreetMap. O contorno municipal vem da malha simplificada do GeoData BR, código IBGE 2607901. [Créditos do OpenStreetMap](https://www.openstreetmap.org/copyright) · [Malha do GeoData BR](https://github.com/tbrugz/geodata-br/blob/master/geojson/geojs-26-mun.json)

## API HTTP

Os exemplos usam caminhos relativos à aplicação. Envie corpos de `POST`, `PUT` e `PATCH` em JSON com `Content-Type: application/json`. Respostas com corpo usam JSON. Os erros usam `{"error":"mensagem"}`, com a exceção do `400` de `/api/route-map`, cujo corpo é `null`.

| Método | Caminho | Resultado |
| --- | --- | --- |
| `GET` | [`/api/incidents`](#get-apiincidents) | Lista ocorrências visíveis |
| `POST` | [`/api/incidents`](#post-apiincidents) | Cria uma ocorrência |
| `GET` | [`/api/incidents/{id}`](#get-apiincidentsid) | Consulta uma ocorrência e suas mensagens |
| `PUT` | [`/api/incidents/{id}`](#put-apiincidentsid) | Substitui a categoria e a descrição |
| `PATCH` | [`/api/incidents/{id}`](#patch-apiincidentsid) | Atualiza curtidas, mensagens ou ocultação |
| `DELETE` | [`/api/incidents/{id}`](#delete-apiincidentsid) | Exclui a ocorrência |
| `POST` | [`/api/route-addresses`](#post-apiroute-addresses) | Busca endereços em Jaboatão |
| `POST` | [`/api/routes`](#post-apiroutes) | Calcula e ordena alternativas de trajeto |
| `GET` | [`/api/route-map`](#get-apiroute-map) | Obtém a geometria de ruas para exportação |

### Sessão e formatos comuns

O cookie anônimo `alerta_viewer` identifica o navegador para autoria, curtidas e ocultação. A página inicial, os dois `GET` de ocorrências e a criação bem-sucedida emitem o cookie quando necessário. Clientes HTTP devem guardar o `Set-Cookie` e enviar o cookie nas requisições seguintes. `PUT`, `PATCH` e `DELETE` exigem uma sessão válida e retornam `403` quando `Sec-Fetch-Site` indica `cross-site` ou `same-site`. O cálculo de rotas aceita o cookie para excluir os registros ocultados por essa sessão.

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

`origin` e `destination` devem ser pontos distintos dentro de Jaboatão. Modos aceitos são `car` (carro), `foot` (a pé) e `bike` (bicicleta). O padrão é `car`.

Em uma resposta `200`, os campos `path`, `distance`, `duration` e `nearbyIncidents` no nível superior descrevem a melhor rota. `options` contém as alternativas ordenadas, com esses mesmos quatro campos em cada item. `comparedRoutes` é o número de alternativas em `options`.

| Campo | Formato |
| --- | --- |
| `path` | Array ordenado de pontos `{lat, lng}` |
| `distance` | Distância em metros |
| `duration` | Tempo estimado em segundos |
| `nearbyIncidents` | Quantidade de ocorrências visíveis a menos de 150 m do trajeto |

Retorna `400` para coordenadas ou modo inválidos, `404` quando não encontra um trajeto para o modo escolhido, `429` quando o limitador local impede uma consulta ao servidor público e `503` quando o serviço de rotas está indisponível.

### GET /api/route-map

```http
GET /api/route-map?bbox=-8.16,-35.02,-8.14,-35.00
```

`bbox` contém quatro coordenadas em graus decimais separadas por vírgula, na ordem sul, oeste, norte e leste. O norte deve ser maior que o sul, o leste deve ser maior que o oeste e o retângulo deve caber na caixa envolvente do município expandida em 0,15° em cada direção.

Retorna `200` com um array de segmentos de ruas, cada um composto por pelo menos dois pontos `{lat, lng}`. Retorna `200` com `[]` quando não há segmentos disponíveis, inclusive quando os provedores Overpass falham. Uma caixa inválida retorna `400` com `null`.
