import { Phone, Route } from "lucide-react";

export function MapQuickActions({ hasTrip, disabled, onRoute }: {
  hasTrip: boolean;
  disabled?: boolean;
  onRoute: () => void;
}) {
  return <nav className="map-quick-actions" aria-label="Ações do mapa">
    <button type="button" className="route-launcher" disabled={disabled} onClick={onRoute} aria-haspopup="dialog">
      <Route size={22} aria-hidden="true" />{hasTrip ? "Editar rota" : "Traçar rota"}
    </button>
    <a className="emergency-link" href="tel:190" aria-label="Emergência policial, ligar 190">
      <Phone size={19} aria-hidden="true" />
      <span><small>Emergência</small><strong>190</strong></span>
    </a>
  </nav>;
}
