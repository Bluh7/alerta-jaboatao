import { useState } from "react";
import { Bike, CarFront, Check, ChevronDown, ChevronLeft, ChevronRight, Footprints, GitCompareArrows, Link2, MapPin, X } from "lucide-react";
import { LiveRouteShare } from "./live-route-share";
import { routeShareUrl } from "../lib/shared-route";
import type { Location } from "../lib/territory";
import { incidentRadiusMeters, travelModes, type TravelMode, type Trip, type TripPreview } from "../lib/trip";

const modeDetails = {
  car: { label: "Carro", Icon: CarFront },
  foot: { label: "A pé", Icon: Footprints },
  bike: { label: "Bicicleta", Icon: Bike },
};

export function RouteSummary({ trip, preview, position, index, count, mode, error, comparing, onMode, onBrowse, onConfirm, onCompare, onClose }: {
  trip: Trip;
  preview: TripPreview | null;
  position?: Location | null;
  index: number;
  count: number;
  mode: TravelMode;
  error: string;
  comparing: boolean;
  onMode: (mode: TravelMode) => void;
  onBrowse: (index: number) => void;
  onConfirm: () => void;
  onCompare: () => void;
  onClose: () => void;
}) {
  const nearby = preview?.nearbyIncidents ?? 0;
  const time = preview && Math.max(1, Math.round(preview.duration / 60));
  const distance = preview && (preview.distance / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const [shareStatus, setShareStatus] = useState("");
  const [manualLink, setManualLink] = useState("");
  const [expanded, setExpanded] = useState(false);
  const collapsed = !comparing && !expanded && Boolean(preview);
  const ModeIcon = modeDetails[mode].Icon;

  async function copyLink() {
    if (!preview) return;
    setShareStatus("");
    const url = routeShareUrl(window.location.href, preview, mode);
    try {
      await navigator.clipboard.writeText(url);
      setManualLink("");
      setShareStatus("Link da rota copiado.");
    } catch {
      setManualLink(url);
    }
  }

  return <section className={`action-sheet route-summary${collapsed ? " route-collapsed" : ""}`} aria-labelledby="route-summary-heading">
    {!comparing && preview && <button type="button" className="route-disclosure"
      aria-expanded={!collapsed} aria-controls="route-summary-options"
      aria-label={collapsed ? "Expandir opções da rota" : "Recolher opções da rota"}
      onClick={() => setExpanded(collapsed)}>
      <ModeIcon size={18} aria-hidden="true" />
      <strong>{time} min</strong>
      <span className="route-disclosure-destination">{trip.destination.label}</span>
      <span className="route-live-indicator">Ao vivo</span>
      <ChevronDown size={18} aria-hidden="true" />
    </button>}
    <div id="route-summary-options" className="route-options" inert={collapsed}>
    <div className="route-options-content">
    <div className="sheet-header">
      <div>
        <h2 id="route-summary-heading">
          {comparing ? (count ? `Rota ${index + 1} de ${count}` : "Comparar rotas") : "Rota escolhida"}
        </h2>
        <p className="route-destination"><MapPin size={16} aria-hidden="true" /> <span>{trip.destination.label}</span></p>
      </div>
      <button type="button" className="close-button" aria-label={comparing ? "Fechar comparação" : "Remover rota do mapa"}
        onClick={onClose}><X size={20} /></button>
    </div>
    {comparing ? <div className="route-modes" role="group" aria-label="Modo de transporte">
      {travelModes.map(option => {
        const { Icon, label } = modeDetails[option];
        return <button type="button" key={option} aria-pressed={mode === option}
          onClick={() => { if (mode !== option) onMode(option); }}>
          <Icon size={18} aria-hidden="true" />{label}
        </button>;
      })}
    </div> : null}
    {preview ? <div className="route-stats" aria-live="polite">
      <div className="route-stats-heading">
        <strong>{time} min</strong><span>{distance} km</span>
        {!comparing && <span className="route-confirmed-mode"><ModeIcon size={16} aria-hidden="true" />{modeDetails[mode].label}</span>}
        {index === 0 && count > 1 && <span className="route-recommended">Recomendada</span>}
      </div>
      <p>{nearby === 0 ? `Nenhum registro a até ${incidentRadiusMeters} m do trajeto.` :
        `${nearby} ${nearby === 1 ? "registro próximo" : "registros próximos"} (até ${incidentRadiusMeters} m do trajeto).`}</p>
    </div> : error ? <>
      <p className="route-form-error" role="alert">{error}</p>
      <button type="button" className="route-compare-button" onClick={() => onMode(mode)}>Tentar novamente</button>
    </> : <p role="status">Calculando rotas · {modeDetails[mode].label}…</p>}
    {comparing && preview && <div className="route-comparison-controls">
      {count > 1 && <><button type="button" className="close-button" aria-label="Ver rota anterior" disabled={index === 0}
        onClick={() => onBrowse(index - 1)}><ChevronLeft size={21} /></button>
      <button type="button" className="close-button" aria-label="Ver próxima rota" disabled={index === count - 1}
        onClick={() => onBrowse(index + 1)}><ChevronRight size={21} /></button></>}
      <button type="button" className="route-submit" onClick={() => { setExpanded(false); onConfirm(); }}><Check size={19} aria-hidden="true" />Escolher esta rota</button>
    </div>}
    {!comparing && <>
      <div className="route-share-actions">
        <button type="button" className="route-compare-button" onClick={() => {
          setShareStatus("");
          setManualLink("");
          onCompare();
        }}><GitCompareArrows size={17} aria-hidden="true" />Comparar rotas</button>
        {preview && <>
          <button type="button" className="route-compare-button" onClick={() => void copyLink()}>
            <Link2 size={17} aria-hidden="true" />Copiar link
          </button>
        </>}
      </div>
      {manualLink && <input className="route-share-link" aria-label="Link da rota" readOnly value={manualLink}
        onFocus={event => event.currentTarget.select()} />}
      {shareStatus && <p role="status">{shareStatus}</p>}
      {preview && <LiveRouteShare position={position ?? null} route={preview} mode={mode} />}
    </>}
    </div>
    </div>
  </section>;
}
