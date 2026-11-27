"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, CircleAlert, Layers, LoaderCircle } from "lucide-react";
import { categories, categoryKeys, type Category, type Incident } from "../lib/incidents";
import type { Location } from "../lib/territory";
import { IncidentIcon } from "./incident-icon";
import { IncidentPicker } from "./incident-picker";
import { IncidentDiary } from "./incident-diary";
import { IncidentChat } from "./incident-chat";
import { changeIncident, IncidentDetails } from "./incident-details";
import { RoutePlanner } from "./route-planner";
import { RouteSummary } from "./route-summary";
import { MapQuickActions } from "./map-quick-actions";
import type { RouteResult, TravelMode, Trip, TripPreview } from "../lib/trip";
import { readSharedRoute, sharedRoutePrefix } from "../lib/shared-route";

type RouteChoice = { mode: TravelMode; index: number; result: RouteResult | null; error: string };

function clearSharedRouteLink() {
  if (window.location.hash.startsWith(sharedRoutePrefix)) {
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState(window.history.state, "", url);
  }
}

const CityMap = dynamic(() => import("./city-map"), {
  ssr: false,
  loading: () => <div className="map-loading" role="status"><LoaderCircle size={22} /> Carregando mapa…</div>,
});

export default function Dashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [showFilters, setShowFilters] = useState(false);
  const [showDiary, setShowDiary] = useState(false);
  const [showRoutePlanner, setShowRoutePlanner] = useState(false);
  const [userPosition, setUserPosition] = useState<Location | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [routeChoice, setRouteChoice] = useState<RouteChoice>({ mode: "car", index: 0, result: null, error: "" });
  const [confirmedRoute, setConfirmedRoute] = useState<RouteChoice | null>(null);
  const [comparingRoutes, setComparingRoutes] = useState(false);
  const routeRequest = useRef<AbortController | null>(null);
  const [diaryStatus, setDiaryStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mapTarget, setMapTarget] = useState<Location | null>(null);
  const [selected, setSelected] = useState<Location | null>(null);
  const [active, setActive] = useState<Incident | null>(null);
  const [saving, setSaving] = useState<Category | null>(null);
  const [notice, setNotice] = useState<{ text: string; success?: boolean; undoId?: string } | null>(null);
  const pending = useRef(false);
  const revision = useRef(0);
  const diaryToggle = useRef<HTMLButtonElement>(null);
  const actionArea = useRef<HTMLDivElement>(null);

  useEffect(() => () => routeRequest.current?.abort(), []);

  useEffect(() => {
    function openSharedRoute() {
      if (!window.location.hash.startsWith(sharedRoutePrefix)) return;
      const shared = readSharedRoute(window.location.hash);
      if (!shared) {
        setNotice({ text: "O link da rota está incompleto ou inválido." });
        return;
      }
      routeRequest.current?.abort();
      const { route, mode } = shared;
      const choice = { mode, index: 0, result: { ...route, comparedRoutes: 1, options: [route] }, error: "" };
      setTrip({ origin: route.origin, destination: route.destination });
      setRouteChoice(choice);
      setConfirmedRoute(choice);
      setComparingRoutes(false);
      setShowRoutePlanner(false);
      setSelected(null);
      setActive(null);
    }
    openSharedRoute();
    window.addEventListener("hashchange", openSharedRoute);
    return () => window.removeEventListener("hashchange", openSharedRoute);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      const startedAtRevision = revision.current;
      try {
        const response = await fetch(showDiary ? "/api/incidents?diary=1" : "/api/incidents", { signal: controller.signal });
        if (!response.ok) throw new Error();
        const existing: Incident[] = await response.json();
        if (controller.signal.aborted || revision.current !== startedAtRevision) return;
        if (showDiary) {
          setIncidents(existing);
          setDiaryStatus("ready");
          return;
        }
        setIncidents(current => {
          const labels = new Map(current.map(item => [item.id, item.locationLabel]));
          return existing.map(item => ({ ...item, locationLabel: item.locationLabel ?? labels.get(item.id) }));
        });
      } catch {
        if (controller.signal.aborted) return;
        if (showDiary) setDiaryStatus("error");
        else setNotice({ text: "Não foi possível carregar as ocorrências." });
      } finally {
        loading = false;
      }
    }
    void load();
    const refresh = showDiary ? window.setInterval(load, 30_000) : undefined;
    return () => {
      controller.abort();
      window.clearInterval(refresh);
    };
  }, [showDiary]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), notice.undoId ? 9000 : 4400);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const closePanel = useCallback(() => {
    if (pending.current) return;
    setSelected(null);
    setActive(null);
    setShowDiary(false);
  }, []);

  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape" || showDiary || showRoutePlanner) return;
      setShowFilters(false);
      closePanel();
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [closePanel, showDiary, showRoutePlanner]);

  const pick = useCallback((location: Location | null) => {
    if (pending.current) return;
    setShowFilters(false);
    if (!location) {
      setNotice({ text: "Escolha um ponto dentro de Jaboatão." });
      return;
    }
    setActive(null);
    setShowDiary(false);
    setSelected(location);
    setNotice(null);
  }, []);

  const openIncident = useCallback((incident: Incident) => {
    if (pending.current) return;
    setShowFilters(false);
    setSelected(null);
    setShowDiary(false);
    setActive(current => current?.id === incident.id ? null : incident);
    setNotice(null);
  }, []);

  function closeDiary() {
    setShowDiary(false);
    requestAnimationFrame(() => diaryToggle.current?.focus({ preventScroll: true }));
  }

  function toggleDiary() {
    if (pending.current) return;
    if (showDiary) {
      closeDiary();
      return;
    }
    closePanel();
    setShowFilters(false);
    setNotice(null);
    setDiaryStatus("loading");
    setShowDiary(true);
  }

  function focusDiaryEntry(incident: Incident) {
    setShowDiary(false);
    setShowFilters(false);
    setFilter(current => current === incident.category ? current : "all");
    setActive(incident);
    setMapTarget({ lat: incident.lat, lng: incident.lng });
  }

  function openRoutePlanner() {
    if (pending.current) return;
    closePanel();
    setShowFilters(false);
    setShowRoutePlanner(true);
  }

  async function loadRoutes(addresses: Trip, mode: TravelMode) {
    routeRequest.current?.abort();
    const controller = new AbortController();
    routeRequest.current = controller;
    const choice = { mode, index: 0, result: null, error: "" };
    setRouteChoice(choice);
    try {
      const response = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...addresses, mode }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Não foi possível calcular a rota.");
      }
      const result: RouteResult = await response.json();
      if (!controller.signal.aborted) setRouteChoice({ ...choice, result });
    } catch (error) {
      if (!controller.signal.aborted) {
        setRouteChoice({ ...choice, error: error instanceof Error ? error.message : "Não foi possível calcular a rota." });
      }
    } finally {
      if (routeRequest.current === controller) routeRequest.current = null;
    }
  }

  const updateIncident = useCallback((incident: Incident) => {
    revision.current++;
    setIncidents(items => items.map(item => item.id === incident.id ?
      { ...incident, locationLabel: incident.locationLabel ?? item.locationLabel } : item));
    setActive(item => item?.id === incident.id ?
      { ...incident, locationLabel: incident.locationLabel ?? item.locationLabel } : item);
    setFilter(current => current === incident.category ? current : "all");
    setNotice({ text: "Ocorrência atualizada.", success: true });
  }, []);

  const hideIncident = useCallback((id: string, reason: "ignore" | "delete" | "missing") => {
    revision.current++;
    setIncidents(items => items.filter(item => item.id !== id));
    setActive(current => current?.id === id ? null : current);
    if (reason === "ignore") {
      setNotice({ text: "Ocorrência ignorada no mapa e nas próximas rotas.", success: true, undoId: id });
    } else {
      setNotice({ text: reason === "delete" ? "Ocorrência removida." : "Esta ocorrência não está mais disponível.",
        success: reason === "delete" });
    }
  }, []);

  async function restoreIncident(id: string) {
    try {
      const result = await changeIncident(id, { action: "ignore", value: false });
      if (!result) return;
      revision.current++;
      const incident = result.incident;
      setIncidents(items => [incident, ...items.filter(item => item.id !== id)]);
      setFilter(current => current === incident.category ? current : "all");
      setNotice({ text: "Ocorrência restaurada.", success: true });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Não foi possível restaurar a ocorrência." });
    }
  }

  async function save(category: Category) {
    if (!selected || pending.current) return;
    pending.current = true;
    setSaving(category);
    setNotice(null);
    try {
      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...selected, category }),
      });
      if (!response.ok) throw new Error();
      const incident: Incident = await response.json();
      revision.current++;
      setIncidents(current => [incident, ...current.filter(item => item.id !== incident.id)]);
      setFilter(current => current === "all" || current === category ? current : "all");
      setSelected(null);
      setNotice({ text: "Ocorrência registrada no mapa.", success: true });
    } catch {
      setNotice({ text: "Não foi possível registrar. Toque no tipo para tentar novamente." });
    } finally {
      pending.current = false;
      setSaving(null);
    }
  }

  const visible = filter === "all" ? incidents : incidents.filter(item => item.category === filter);
  const undoId = notice?.undoId;
  const panelOpen = Boolean(selected || active || trip);
  const routeOption = routeChoice.result?.options[routeChoice.index];
  const displayedTrip = useMemo<TripPreview | null>(() => trip && routeOption ? {
    ...routeOption, ...trip,
  } : null, [trip, routeOption]);

  return <main className={panelOpen ? "app-map panel-open" : "app-map"}>
    <CityMap incidents={visible} selected={selected} active={active} target={mapTarget} trip={displayedTrip}
      position={userPosition} onPositionChange={setUserPosition} onPick={pick} onOpen={openIncident} />

    <header className="map-header">
      <h1 className="sr-only">Alerta Jaboatão</h1>
      <img className="brand-mark" src="/marca-jaboatao.svg" width="48" height="48" alt="" />
      <div className="header-actions">
        <button type="button" className="filters-toggle diary-toggle" aria-expanded={showDiary}
          aria-controls={showDiary ? "incident-diary" : undefined} onClick={toggleDiary} disabled={Boolean(saving)} ref={diaryToggle}>
          <BookOpen size={19} aria-hidden="true" /><span>Diário</span>
        </button>
        <div className="filter-control">
        <button type="button" className="filters-toggle" aria-label="Filtros" aria-expanded={showFilters} aria-controls="map-filters"
          onClick={() => setShowFilters(current => !current)}>
          <Layers size={19} /><span>Filtros</span>{filter !== "all" && <i aria-label="Filtro ativo" />}
        </button>
        {showFilters && <section className="filter-menu" id="map-filters" aria-label="Filtrar ocorrências">
          {(["all", ...categoryKeys] as const).map(item => <button key={item} type="button" aria-pressed={filter === item}
            onClick={() => {
              setFilter(item);
              if (item !== "all" && active?.category !== item) setActive(null);
              setShowFilters(false);
            }}>
            {item === "all" ? <span className="category-glyph all-glyph"><Layers size={17} /></span> :
              <IncidentIcon category={item} size={17} />}
            <span>{item === "all" ? "Todas as ocorrências" : categories[item].label}</span>
            {filter === item && <Check className="filter-check" size={17} />}
          </button>)}
        </section>}
        </div>
      </div>
    </header>

    {showDiary && <IncidentDiary incidents={incidents} status={diaryStatus} onSelect={focusDiaryEntry} onClose={closeDiary} />}
    <RoutePlanner open={showRoutePlanner} position={userPosition} onClose={() => setShowRoutePlanner(false)} onResult={result => {
      clearSharedRouteLink();
      setTrip(result);
      setConfirmedRoute(null);
      setComparingRoutes(true);
      void loadRoutes(result, "car");
      setShowRoutePlanner(false);
    }} />

    <MapQuickActions hasTrip={Boolean(trip)} disabled={Boolean(saving)} onRoute={openRoutePlanner} />

    <div className="action-area" ref={actionArea}>
      {notice && <div className="map-notice" role="status">
        {notice.success ? <Check size={18} /> : <CircleAlert size={18} />}
        <span>{notice.text}</span>
        {undoId && <button type="button" className="notice-undo" onClick={() => void restoreIncident(undoId)}>Desfazer</button>}
      </div>}

      {selected ? <IncidentPicker saving={saving} onSelect={save} onClose={closePanel} /> :
      active ? <IncidentDetails key={active.id} incident={active} onClose={closePanel} onUpdate={updateIncident} onHide={hideIncident} /> :
      trip ? <RouteSummary trip={trip} preview={displayedTrip} position={userPosition} index={routeChoice.index}
        mode={routeChoice.mode} count={routeChoice.result?.options.length ?? 0}
        comparing={comparingRoutes} error={routeChoice.error}
        onMode={mode => void loadRoutes(trip, mode)}
        onBrowse={index => setRouteChoice(current => ({ ...current, index }))}
        onConfirm={() => {
          clearSharedRouteLink();
          setConfirmedRoute(routeChoice);
          setComparingRoutes(false);
        }}
        onCompare={() => setComparingRoutes(true)}
        onClose={() => {
          routeRequest.current?.abort();
          if (comparingRoutes && confirmedRoute) {
            setRouteChoice(confirmedRoute);
            setComparingRoutes(false);
          } else {
            setTrip(null);
            clearSharedRouteLink();
          }
        }} /> : null}
    </div>
    <IncidentChat actionArea={actionArea} />
  </main>;
}
