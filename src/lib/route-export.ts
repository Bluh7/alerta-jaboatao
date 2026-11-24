import { incidentRadiusMeters, type TripPreview } from "./trip";
import { territory, type Location } from "./territory";

export const routeFileName = "rota-alerta-jaboatao.html";

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function routeMap(points: Location[]) {
  let { lng: west, lat: north } = points[0];
  let { lng: east, lat: south } = points[0];
  for (const { lng, lat } of points) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    north = Math.max(north, lat);
    south = Math.min(south, lat);
  }
  const longitudeScale = Math.cos((north + south) / 2 * Math.PI / 180);
  const width = (east - west) * longitudeScale;
  const height = north - south;
  const scale = Math.min(560 / Math.max(width, 0.00001), 300 / Math.max(height, 0.00001));
  const project = ({ lng, lat }: Location) => ({
    x: (320 + ((lng - west) * longitudeScale - width / 2) * scale).toFixed(2),
    y: (190 + (north - lat - height / 2) * scale).toFixed(2),
  });
  const centerLat = (north + south) / 2;
  const centerLng = (west + east) / 2;
  const halfLat = 190 / scale;
  const halfLng = 320 / scale / longitudeScale;
  const bounds = [centerLat - halfLat, centerLng - halfLng, centerLat + halfLat, centerLng + halfLng]
    .map((value, index) => (index < 2 ? Math.floor(value * 1000) : Math.ceil(value * 1000)) / 1000);
  return { project, bounds };
}

export function renderRouteFile(route: TripPreview, modeLabel: string, roads: Location[][]): string {
  const routePoints = [...route.path, route.origin, route.destination];
  const { project } = routeMap(routePoints);
  const origin = project(route.origin);
  const destination = project(route.destination);
  const polyline = (points: Location[]) => points.map(project).map(({ x, y }) => `${x},${y}`).join(" ");
  const background = roads.map(road => `<polyline points="${polyline(road)}"/>`).join("\n");
  const path = polyline(route.path);
  const time = Math.max(1, Math.round(route.duration / 60));
  const distance = (route.distance / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const overview = roads.length ? "" : renderMunicipalOverview(routePoints, route.path);

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <title>Rota compartilhada · Alerta Jaboatão</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: clamp(16px, 5vw, 40px); background: #f0f5fa; color: #142539; font-family: system-ui, sans-serif; }
    main { max-width: 720px; margin: auto; }
    h1 { color: #173b62; margin: 0; font-size: clamp(1.5rem, 5vw, 2.15rem); }
    dl { display: grid; gap: 12px; padding: 16px; border-radius: 15px; background: white; overflow-wrap: anywhere; }
    dt { font-weight: 700; }
    dd, figure { margin: 0; }
    svg { display: block; width: 100%; height: auto; border-radius: 15px; background: #dceaf8; }
    figcaption, .note { color: #435a70; margin-top: 8px; }
  </style>
</head>
<body>
<main>
  <h1>Rota compartilhada</h1>
  <p><strong>${escapeHtml(modeLabel)} · ${time} min · ${distance} km</strong></p>
  <dl>
    <div><dt>A · Origem</dt><dd>${escapeHtml(route.origin.label)}</dd></div>
    <div><dt>B · Destino</dt><dd>${escapeHtml(route.destination.label)}</dd></div>
  </dl>
  <figure>
    <svg viewBox="0 0 640 380" role="img" aria-label="Trajeto de A até B, com o norte para cima">
      <g id="ruas" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${background}
      </g>
      <polyline points="${path}" fill="none" stroke="#1767d6" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <g font-size="12" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="white">
        <circle cx="${origin.x}" cy="${origin.y}" r="11" fill="#1767d6"/>
        <text x="${origin.x}" y="${origin.y}">A</text>
        <circle cx="${destination.x}" cy="${destination.y}" r="11" fill="#173b62"/>
        <text x="${destination.x}" y="${destination.y}">B</text>
      </g>
      <text x="604" y="31" text-anchor="middle" fill="#435a70" font-size="14">↑ N</text>
    </svg>
    <figcaption>${roads.length
      ? "Mapa de ruas e trajeto. Dados © colaboradores do OpenStreetMap, disponíveis sob a licença ODbL."
      : "Ruas indisponíveis na exportação. O traçado mostra a rota escolhida."}</figcaption>
  </figure>
  ${overview}
  <p class="note">Registros na consulta original a até ${incidentRadiusMeters} m do trajeto: ${route.nearbyIncidents}.</p>
</main>
</body>
</html>`;
}

function renderMunicipalOverview(points: Location[], path: Location[]) {
  const { project } = routeMap([...territory, ...points]);
  const coordinates = (line: Location[]) => line.map(project).map(({ x, y }) => `${x},${y}`).join(" ");
  return `<h2>Visão geral de Jaboatão</h2>
    <svg viewBox="0 0 640 380" role="img" aria-label="Limite de Jaboatão e posição da rota no município">
      <polygon points="${coordinates(territory)}" fill="#f0f5fa" stroke="#435a70" stroke-width="2"/>
      <polyline points="${coordinates(path)}" fill="none" stroke="#1767d6" stroke-width="5" stroke-linecap="round"/>
    </svg>`;
}

export async function prepareRouteFile(route: TripPreview, modeLabel: string) {
  const { bounds } = routeMap([...route.path, route.origin, route.destination]);
  let roads: Location[][] = [];
  try {
    const response = await fetch("/api/route-map?bbox=" + bounds.join(","), { signal: AbortSignal.timeout(22_000) });
    if (response.ok) {
      const paths = await response.json();
      if (Array.isArray(paths)) roads = paths;
    }
  } catch {
    // A network failure still allows the route and municipal outline to be exported.
  }
  const file = new File([renderRouteFile(route, modeLabel, roads)], routeFileName, { type: "text/html" });
  return { file, hasStreets: roads.length > 0 };
}

export async function downloadRouteFile(route: TripPreview, modeLabel: string) {
  const { file, hasStreets } = await prepareRouteFile(route, modeLabel);
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  return hasStreets;
}
