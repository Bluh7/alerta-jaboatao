"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { categories, type Incident } from "../lib/incidents";
import { readSharedRoute } from "../lib/shared-route";
import type { Location } from "../lib/territory";
import type { TripPreview } from "../lib/trip";

const CityMap = dynamic(() => import("./city-map"), { ssr: false });
const ignore = () => {};

export function LiveRouteViewer({ id }: { id: string }) {
  const [route, setRoute] = useState<TripPreview | null>(null);
  const [position, setPosition] = useState<Location | null>(null);
  const [status, setStatus] = useState("Buscando compartilhamento ao vivo…");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = incidents.find(incident => incident.id === selectedId) ?? null;
  const selectIncident = useCallback((incident: Incident) => setSelectedId(incident.id), []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let hasRoute = false;
    let nextIncidentRefresh = 0;
    async function poll() {
      try {
        const url = new URL(`/api/live-routes/${encodeURIComponent(id)}`, window.location.origin);
        if (!hasRoute) url.searchParams.set("route", "1");
        if (Date.now() >= nextIncidentRefresh) url.searchParams.set("incidents", "1");
        const response = await fetch(url, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]),
        });
        if (controller.signal.aborted) return;
        if (response.status === 404) {
          setPosition(null);
          setRoute(null);
          setStatus("Este compartilhamento terminou ou está indisponível.");
          return;
        }
        if (!response.ok) throw new Error();
        const data: { route?: string; position: Location; incidents?: Incident[] } = await response.json();
        if (controller.signal.aborted) return;
        if (!hasRoute) {
          const shared = data.route && readSharedRoute(data.route);
          if (!shared) throw new Error();
          setRoute(shared.route);
          hasRoute = true;
        }
        if (data.incidents) {
          setIncidents(data.incidents);
          nextIncidentRefresh = Date.now() + 15_000;
        }
        const { lat, lng } = data.position;
        setPosition(previous => previous?.lat === lat && previous.lng === lng ? previous : { lat, lng });
        setStatus("");
      } catch {
        if (controller.signal.aborted) return;
        setPosition(null);
        setStatus("Aguardando conexão para acompanhar a localização…");
      }
      timer = setTimeout(() => void poll(), 4_000);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id]);

  return <main className="app-map">
    {route && <CityMap incidents={incidents} selected={null} active={selected} target={null} trip={route} position={position}
      following onPositionChange={ignore} onPick={ignore} onOpen={selectIncident} />}
    <header className="map-header">
      <div className="live-view-heading">
        <h1>Acompanhamento ao vivo</h1>
        {route && <p>Destino: {route.destination.label}</p>}
        <p role="status">{status}</p>
      </div>
    </header>
    {route && selected && <div className="action-area">
      <section className="action-sheet" aria-labelledby="live-incident-title">
        <div className="sheet-header">
          <div>
            <h2 id="live-incident-title">{categories[selected.category].label}</h2>
            <time dateTime={selected.createdAt}>{new Date(selected.createdAt).toLocaleString("pt-BR", {
              timeZone: "America/Recife", dateStyle: "short", timeStyle: "short",
            })}</time>
          </div>
          <button type="button" className="close-button" aria-label="Fechar ocorrência" onClick={() => setSelectedId(null)}><X size={20} /></button>
        </div>
        {selected.description && <p className="incident-description">{selected.description}</p>}
      </section>
    </div>}
  </main>;
}
