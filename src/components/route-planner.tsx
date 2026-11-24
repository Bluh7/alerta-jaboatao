import { useEffect, useRef, useState, type FormEvent } from "react";
import { Circle, LoaderCircle, MapPin, Route, X } from "lucide-react";
import type { RouteAddress, Trip } from "../lib/trip";
import { isValidLocation, type Location } from "../lib/territory";

type Field = "origin" | "destination";
const fields = [
  { key: "origin", label: "Origem", placeholder: "De onde você sai?", Icon: Circle },
  { key: "destination", label: "Destino", placeholder: "Aonde você quer chegar?", Icon: MapPin },
] as const;

async function request<T>(url: string, body: object, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || "Não foi possível calcular a rota. Tente novamente.");
  }
  return response.json();
}

export function RoutePlanner({ open, position, onClose, onResult }: {
  open: boolean;
  position: Location | null;
  onClose: () => void;
  onResult: (trip: Trip) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pending = useRef<AbortController | null>(null);
  const [addresses, setAddresses] = useState({ origin: "", destination: "" });
  const [matches, setMatches] = useState<Record<Field, RouteAddress[]>>({ origin: [], destination: [] });
  const [chosen, setChosen] = useState<Record<Field, RouteAddress | null>>({ origin: null, destination: null });
  const [error, setError] = useState("");
  const [working, setWorking] = useState("");
  const [activeField, setActiveField] = useState<Field | null>(null);
  const [highlight, setHighlight] = useState(-1);
  const [lookup, setLookup] = useState<{ field: Field; query: string; text: string } | null>(null);
  const [useCurrentOrigin, setUseCurrentOrigin] = useState(true);
  const currentOrigin = position && isValidLocation(position) ? { ...position, label: "Minha localização" } : null;
  const locationOrigin = useCurrentOrigin ? currentOrigin : null;
  const effectiveChosen = locationOrigin ? { ...chosen, origin: locationOrigin } : chosen;
  const activeQuery = activeField ? addresses[activeField].trim() : "";
  const hasMatches = Boolean(activeField && matches[activeField].length);
  const hasChoice = Boolean(activeField && effectiveChosen[activeField]);

  useEffect(() => {
    if (!open) return;
    setUseCurrentOrigin(true);
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      pending.current?.abort();
      pending.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open || working || !activeField || activeQuery.length < 3 || hasChoice || hasMatches) return;
    const controller = new AbortController();
    const field = activeField;
    const query = activeQuery;
    const timer = window.setTimeout(async () => {
      setLookup({ field, query, text: "Buscando em Jaboatão…" });
      try {
        const results = await request<RouteAddress[]>("/api/route-addresses", { query }, controller.signal);
        if (controller.signal.aborted) return;
        setMatches(current => ({ ...current, [field]: results }));
        setLookup(results.length ? null : { field, query, text: "Nenhum endereço encontrado em Jaboatão." });
      } catch {
        if (!controller.signal.aborted) {
          setLookup({ field, query, text: "Sugestões indisponíveis no momento." });
        }
      }
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, activeField, activeQuery, hasChoice, hasMatches, working]);

  function changeAddress(field: Field, value: string) {
    setAddresses(current => ({ ...current, [field]: value }));
    setMatches(current => ({ ...current, [field]: [] }));
    setChosen(current => ({ ...current, [field]: null }));
    setActiveField(field);
    setHighlight(-1);
    setLookup(null);
    setError("");
  }

  function chooseAddress(field: Field, match: RouteAddress) {
    setAddresses(current => ({ ...current, [field]: match.label }));
    setChosen(current => ({ ...current, [field]: match }));
    setActiveField(null);
    setHighlight(-1);
    setLookup(null);
    setError("");
  }

  function close() {
    pending.current?.abort();
    pending.current = null;
    setWorking("");
    setError("");
    setActiveField(null);
    setLookup(null);
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setError("");
    try {
      const missing = fields.filter(({ key }) => !effectiveChosen[key] && matches[key].length === 0);
      if (missing.length) setWorking("Buscando endereços…");
      const found = await Promise.all(missing.map(async ({ key }) => ({
        key, results: await request<RouteAddress[]>("/api/route-addresses", { query: addresses[key] }, controller.signal),
      })));
      if (controller.signal.aborted) return;

      const nextMatches = { ...matches };
      const nextChosen = { ...chosen };
      for (const { key } of fields) {
        if (!effectiveChosen[key] && matches[key].length === 1) nextChosen[key] = matches[key][0];
      }
      for (const { key, results } of found) {
        nextMatches[key] = results;
        nextChosen[key] = results.length === 1 ? results[0] : null;
      }
      setMatches(nextMatches);
      setChosen(nextChosen);

      const unknown = found.filter(({ results }) => results.length === 0);
      if (unknown.length) {
        setError(unknown.length === 2 ? "Não encontramos os endereços em Jaboatão. Inclua a rua e o bairro." :
          unknown[0].key === "origin" ? "Origem não encontrada em Jaboatão. Inclua a rua e o bairro." :
            "Destino não encontrado em Jaboatão. Inclua a rua e o bairro.");
        return;
      }

      const origin = locationOrigin ?? nextChosen.origin;
      const { destination } = nextChosen;
      if (!origin || !destination) return;
      onResult({ origin, destination });
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "Não foi possível calcular a rota.");
        controller.abort();
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setWorking("");
      }
    }
  }

  if (!open) return null;
  const needsSelection = fields.some(({ key }) => matches[key].length > 1 && !effectiveChosen[key]);

  return <dialog id="route-planner" className="route-planner" aria-labelledby="route-heading" ref={dialogRef}
    onCancel={event => { event.preventDefault(); close(); }}>
    <header className="route-planner-header">
      <span className="route-emblem" aria-hidden="true"><Route size={24} /></span>
      <div>
        <h2 id="route-heading">Planejar rota</h2>
      </div>
      <button type="button" className="close-button" aria-label="Fechar planejador de rota" onClick={close}><X size={20} /></button>
    </header>
    <form className="route-form" onSubmit={submit}>
      {currentOrigin && <label className="route-current-origin">
        <input type="checkbox" checked={useCurrentOrigin} disabled={Boolean(working)} onChange={event => {
          setUseCurrentOrigin(event.target.checked);
          setActiveField(null);
          setLookup(null);
          setError("");
        }} /> Usar minha localização como origem
      </label>}
      {fields.map(({ key, label, placeholder, Icon }) => {
        if (key === "origin" && locationOrigin) return null;
        const expanded = activeField === key && !chosen[key] && !working && matches[key].length > 0;
        const listId = `route-${key}-suggestions`;
        return <div className="route-field" key={key} onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) setActiveField(current => current === key ? null : current);
        }}>
        <label htmlFor={`route-${key}`}><Icon size={17} aria-hidden="true" /> {label}</label>
        <input id={`route-${key}`} role="combobox" aria-autocomplete="list" aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          aria-activedescendant={expanded && highlight >= 0 ? `${listId}-${highlight}` : undefined}
          autoComplete="off" value={addresses[key]} onChange={event => changeAddress(key, event.target.value)}
          onFocus={() => { setActiveField(key); setHighlight(-1); }}
          onKeyDown={event => {
            if (!expanded) return;
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setActiveField(null);
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : -1;
              const next = highlight < 0 && step < 0 ? matches[key].length - 1 :
                Math.max(0, Math.min(matches[key].length - 1, highlight + step));
              setHighlight(next);
              document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
            } else if (event.key === "Enter" && highlight >= 0) {
              event.preventDefault();
              chooseAddress(key, matches[key][highlight]);
            }
          }}
          placeholder={placeholder} required minLength={3} maxLength={160} disabled={Boolean(working)} />
        {expanded && <ul id={listId} className="route-suggestions" role="listbox" aria-label={`Sugestões para ${label.toLowerCase()}`}>
          {matches[key].map((match, index) => <li key={`${match.lat},${match.lng},${index}`}
            id={`${listId}-${index}`} role="option" aria-selected={highlight === index}
            onMouseDown={event => event.preventDefault()} onClick={() => chooseAddress(key, match)}>
            <MapPin size={16} aria-hidden="true" /><span>{match.label}</span>
          </li>)}
        </ul>}
        {activeField === key && lookup?.field === key && lookup.query === activeQuery && !hasChoice && !hasMatches &&
          <small role="status">{lookup.text}</small>}
        {!expanded && matches[key].length > 1 && !chosen[key] && <select value=""
          aria-label={`Endereços encontrados para ${label.toLowerCase()}`} disabled={Boolean(working)}
          onChange={event => {
            const choice = event.target.value;
            if (choice !== "") chooseAddress(key, matches[key][Number(choice)]);
          }}>
          <option value="">Selecione o endereço correspondente</option>
          {matches[key].map((match, index) => <option key={`${match.lat},${match.lng},${index}`} value={index}>{match.label}</option>)}
        </select>}
        {!expanded && chosen[key] && chosen[key].label !== addresses[key] && <small>{chosen[key].label}</small>}
      </div>;
      })}
      {needsSelection && <p className="route-form-status" role="status">Selecione o endereço correto para continuar.</p>}
      {error && <p className="route-form-error" role="alert">{error}</p>}
      <button type="submit" className="route-submit" disabled={Boolean(working) || needsSelection}>
        {working ? <LoaderCircle className="spinner" size={19} aria-hidden="true" /> : <Route size={19} aria-hidden="true" />}
        {working || "Traçar rota"}
      </button>
      <p className="route-provider">Mapas e endereços © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>
        {" · "}<a href="https://project-osrm.org/">OSRM</a>{" · "}<a href="https://www.openstreetmap.org/fixthemap">Corrigir o mapa</a></p>
    </form>
  </dialog>;
}
