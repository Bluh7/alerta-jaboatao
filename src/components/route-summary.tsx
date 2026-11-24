import { useState } from "react";
import { Bike, CarFront, Check, ChevronLeft, ChevronRight, Download, Footprints, Link2, MapPin, X } from "lucide-react";
import { downloadRouteFile } from "../lib/route-export";
import { routeShareUrl } from "../lib/shared-route";
import { incidentRadiusMeters, travelModes, type TravelMode, type Trip, type TripPreview } from "../lib/trip";

const modeDetails = {
  car: { label: "Carro", Icon: CarFront },
  foot: { label: "A pé", Icon: Footprints },
  bike: { label: "Bicicleta", Icon: Bike },
};

export function RouteSummary({ trip, preview, index, count, mode, error, comparing, onMode, onBrowse, onConfirm, onCompare, onClose }: {
  trip: Trip;
  preview: TripPreview | null;
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
  const [sharing, setSharing] = useState(false);
  const [manualLink, setManualLink] = useState("");

  async function download() {
    if (!preview) return;
    setSharing(true);
    setShareStatus("");
    try {
      const hasStreets = await downloadRouteFile(preview, modeDetails[mode].label);
      setShareStatus(hasStreets ? "Arquivo baixado. Envie-o como anexo para abrir offline." :
        "Rota baixada com o limite de Jaboatão. O mapa de ruas estava indisponível.");
    } catch {
      setShareStatus("Não foi possível baixar o arquivo. Tente novamente.");
    } finally {
      setSharing(false);
    }
  }

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

  return <section className="action-sheet route-summary" aria-labelledby="route-summary-heading">
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
    </div> : <p>{modeDetails[mode].label}</p>}
    {preview ? <div className="route-stats" aria-live="polite">
      <div className="route-stats-heading">
        <strong>{time} min · {distance} km</strong>
        {index === 0 && count > 1 && <span className="route-recommended">Recomendada</span>}
      </div>
      <p>{nearby === 0 ? `Nenhum registro a até ${incidentRadiusMeters} m do trajeto.` :
        `${nearby} ${nearby === 1 ? "registro próximo" : "registros próximos"} (até ${incidentRadiusMeters} m do trajeto).`}</p>
    </div> : error ? <>
      <p className="route-form-error" role="alert">{error}</p>
      <button type="button" className="route-compare-button" onClick={() => onMode(mode)}>Tentar novamente</button>
    </> : <p role="status">Calculando rotas · {modeDetails[mode].label}…</p>}
    {comparing && preview && <div className="route-comparison-controls">
      <button type="button" className="close-button" aria-label="Ver rota anterior" disabled={index === 0}
        onClick={() => onBrowse(index - 1)}><ChevronLeft size={21} /></button>
      <button type="button" className="close-button" aria-label="Ver próxima rota" disabled={index === count - 1}
        onClick={() => onBrowse(index + 1)}><ChevronRight size={21} /></button>
      <button type="button" className="route-submit" onClick={onConfirm}><Check size={19} aria-hidden="true" />Escolher esta rota</button>
    </div>}
    {!comparing && <>
      <div className="route-share-actions">
        <button type="button" className="route-compare-button" onClick={() => {
          setShareStatus("");
          setManualLink("");
          onCompare();
        }}>Comparar rotas</button>
        {preview && <>
          <button type="button" className="route-compare-button" onClick={() => void copyLink()}>
            <Link2 size={17} aria-hidden="true" />Copiar link
          </button>
          <button type="button" className="route-compare-button" disabled={sharing} onClick={() => void download()}>
            <Download size={17} aria-hidden="true" />{sharing ? "Preparando mapa…" : "Baixar mapa offline"}
          </button>
        </>}
      </div>
      {manualLink && <input className="route-share-link" aria-label="Link da rota" readOnly value={manualLink}
        onFocus={event => event.currentTarget.select()} />}
      {shareStatus && <p role="status">{shareStatus}</p>}
    </>}
  </section>;
}
