import { useEffect, useRef } from "react";
import { BookOpen, Check, MapPin, X } from "lucide-react";
import { categories, incidentDay, type Incident } from "../lib/incidents";
import { IncidentIcon } from "./incident-icon";

const timeZone = "America/Recife";
const timeFormat = new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" });

export function IncidentDiary({ incidents, status, onSelect, onClose }: {
  incidents: Incident[];
  status: "loading" | "ready" | "error";
  onSelect: (incident: Incident) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = panel.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const today = incidentDay.format(new Date());
  const entries = incidents.filter(incident => incidentDay.format(new Date(incident.createdAt)) === today)
    .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));

  return <dialog id="incident-diary" className="diary-view" aria-labelledby="diary-heading" ref={panel}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="diary-header">
      <div className="diary-heading">
        <span className="diary-emblem" aria-hidden="true"><BookOpen size={26} /></span>
        <div><h2 id="diary-heading">Diário de ocorrências</h2><p>{today}</p></div>
      </div>
      <button type="button" className="close-button" aria-label="Fechar diário" onClick={onClose}><X size={20} /></button>
    </header>
    <div className="diary-content" aria-busy={status === "loading"}>
      {status === "loading" && entries.length === 0 && <p className="diary-status" role="status">Carregando ocorrências de hoje…</p>}
      {status === "error" && <p className="diary-status" role="status">Não foi possível atualizar o diário.</p>}
      {status === "ready" && entries.length === 0 && <div className="diary-empty" role="status">
        <div className="diary-empty-art" aria-hidden="true">
          <span className="diary-empty-book">📔</span><span className="diary-empty-check"><Check size={23} strokeWidth={3} /></span>
        </div>
        <h3>Nenhuma ocorrência hoje</h3>
        <p>Os registros de hoje disponíveis para você aparecerão aqui.</p>
      </div>}
      {entries.length > 0 && <ul className="diary-list" aria-label="Ocorrências de hoje">
      {entries.map(incident => <li key={incident.id}>
        <button type="button" onClick={() => onSelect(incident)}>
          <IncidentIcon category={incident.category} size={20} />
          <span className="diary-entry">
            <span className="diary-entry-heading">
              <strong>{categories[incident.category].label}</strong>
              <time dateTime={incident.createdAt}>{timeFormat.format(new Date(incident.createdAt))}</time>
            </span>
            <span className="diary-location">
              <MapPin size={15} aria-hidden="true" />
              {incident.locationLabel || "Ponto no mapa em Jaboatão"}
              <span className="sr-only">. Ver no mapa</span>
            </span>
          </span>
        </button>
      </li>)}
      </ul>}
    </div>
    <footer className="diary-footer">
      Endereços aproximados · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>
    </footer>
  </dialog>;
}
