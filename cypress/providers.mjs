import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const { origin, destination, alternate, outside } = JSON.parse(
  readFileSync(new URL("./fixtures/geo.json", import.meta.url), "utf8"),
);

function feature(point, street, district = "Prazeres") {
  return { geometry: { coordinates: [point.lng, point.lat] }, properties: { street, district } };
}

function addresses(query) {
  if (query.includes("falha")) return [503, {}];
  if (query.includes("ausente")) return [200, { features: [] }];
  if (query.includes("ambíguo")) {
    return [200, { features: [
      feature(outside, "Endereço externo"),
      feature(origin, "Rua Repetida"),
      feature(origin, "Rua Repetida"),
      ...["A", "B", "C", "D", "E", "F"].map(letter => feature(destination, `Rua ${letter}`)),
    ] }];
  }
  const address = query.includes("destino") ? feature(destination, "Rua Destino") : feature(origin, "Rua Origem");
  return [200, { features: [address] }];
}

function routes(url) {
  const [, mode, , , , coordinates] = url.pathname.split("/");
  const points = coordinates.split(";").map(point => point.split(",").map(Number));
  const [start, finish] = [points[0], points.at(-1)];
  const duration = { car: 300, foot: 1200, bike: 600 }[mode];
  const direct = { distance: 1500, duration, geometry: { coordinates: [start, finish] } };
  const longer = { distance: 2200, duration: duration + 180, geometry: {
    coordinates: [start, [alternate.lng, alternate.lat], finish],
  } };
  if (points.length > 2) return [200, { code: "Ok", routes: [longer] }];
  return [200, { code: "Ok", routes: mode === "bike" ? [direct] : [direct, longer] }];
}

export function startProviders() {
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    let result;
    if (url.pathname === "/api") result = addresses((url.searchParams.get("q") ?? "").toLowerCase());
    else if (url.pathname === "/reverse") {
      const matches = Number(url.searchParams.get("lat")) === origin.lat &&
        Number(url.searchParams.get("lon")) === origin.lng;
      const features = matches ? [feature(origin, "Rua de Referência")] : [];
      result = [200, { features }];
    } else if (/^\/(car|foot|bike)\/route\//.test(url.pathname)) result = routes(url);
    else result = [404, {}];
    response.writeHead(result[0], { "Content-Type": "application/json" });
    response.end(JSON.stringify(result[1]));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
