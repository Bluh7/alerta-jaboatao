"use client";

import L from "leaflet";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LocateFixed, MapPin, Minus, Navigation, Plus } from "lucide-react";
import { categories, type Incident } from "../lib/incidents";
import { isInJaboatao, territory, type Location } from "../lib/territory";
import { IncidentIcon } from "./incident-icon";
import { incidentRadiusMeters, type TripPreview } from "../lib/trip";
import { watchUserLocation } from "../lib/user-location";

const initialCenter: Location = { lat: -8.16178, lng: -34.92483 }; // Mercado Velho de Prazeres
const cameraZoom = { min: 17, initial: 17, max: 21 };
const tripOverviewMinZoom = 10;
const incidentAreaPane = "incident-areas";

function fitTrip(map: L.Map, trip: TripPreview) {
  const bounds = L.latLngBounds([...trip.path, trip.origin, trip.destination]);
  const center = bounds.getCenter();
  const anchor = isInJaboatao(center) ? center : isInJaboatao(trip.origin) ? trip.origin : trip.destination;
  const projected = map.project(anchor, 0);
  const nw = map.project(bounds.getNorthWest(), 0);
  const se = map.project(bounds.getSouthEast(), 0);
  const reach = L.point(
    Math.max(projected.x - nw.x, se.x - projected.x),
    Math.max(projected.y - nw.y, se.y - projected.y),
  );
  const view = L.latLngBounds(map.unproject(projected.subtract(reach), 0), map.unproject(projected.add(reach), 0));
  const size = map.getSize();
  const padding = L.point(Math.min(72, size.x * 0.22), Math.min(360, size.y * 0.48));
  map.setView(anchor, Math.min(18, map.getBoundsZoom(view, false, padding)), { animate: false });
}

function MapPinLayer({ map, location, incident, active, onOpen }: {
  map: L.Map;
  location: Location;
  incident?: Incident;
  active?: boolean;
  onOpen?: (incident: Incident) => void;
}) {
  const [content] = useState(() => document.createElement("span"));
  const markerRef = useRef<L.Marker | null>(null);
  const { lat, lng } = location;
  const color = incident && categories[incident.category].color;

  useEffect(() => {
    if (!color) return;
    const area = L.circle([lat, lng], {
      pane: incidentAreaPane,
      className: "incident-area",
      radius: incidentRadiusMeters,
      color,
      weight: 2,
      opacity: 0.55,
      fillOpacity: 0.16,
      interactive: false,
    }).addTo(map);
    return () => { area.remove(); };
  }, [map, lat, lng, color]);

  useEffect(() => {
    const label = incident ? categories[incident.category].label : "Ponto selecionado";
    const marker = L.marker([lat, lng], {
      icon: L.divIcon({ className: "incident-pin", html: content, iconSize: [44, 44], iconAnchor: [22, 44] }),
      title: label,
      alt: label,
      interactive: Boolean(incident),
      keyboard: Boolean(incident),
      zIndexOffset: incident ? 0 : 1000,
    }).addTo(map);
    markerRef.current = marker;
    marker.getElement()?.setAttribute("aria-label", label);
    if (incident && onOpen) {
      marker.on("click", () => onOpen(incident));
      const element = marker.getElement();
      // Leaflet handles Enter on markers. Add the other native button shortcut.
      element?.addEventListener("keydown", handleSpace);
    }
    function handleSpace(event: KeyboardEvent) {
      if (event.key !== " " || !incident || !onOpen) return;
      event.preventDefault();
      onOpen(incident);
    }
    return () => {
      marker.getElement()?.removeEventListener("keydown", handleSpace);
      marker.remove();
      markerRef.current = null;
    };
  }, [map, lat, lng, incident, content, onOpen]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !incident) return;
    marker.setZIndexOffset(active ? 900 : 0);
    marker.getElement()?.setAttribute("aria-expanded", String(Boolean(active)));
  }, [active, incident, onOpen]);

  return createPortal(
    <span className={active ? "pin-face pin-face-active" : "pin-face"}>
      {incident ? <IncidentIcon category={incident.category} marker size={19} /> :
        <span className="pin-glyph selected-glyph"><MapPin size={21} /></span>}
    </span>,
    content,
  );
}

export default function CityMap({ incidents, selected, active, target, trip, position, following = false, onPositionChange, onPick, onOpen }: {
  incidents: Incident[];
  selected: Location | null;
  active: Incident | null;
  target: Location | null;
  trip: TripPreview | null;
  position: Location | null;
  following?: boolean;
  onPositionChange: (position: Location | null) => void;
  onPick: (location: Location | null) => void;
  onOpen: (incident: Incident) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const viewingOutsideLocation = useRef(false);
  const locationArrow = useRef<HTMLSpanElement>(null);
  const heading = useRef<number | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const [tileError, setTileError] = useState(false);
  const [zoom, setZoom] = useState(cameraZoom.initial);
  const [locating, setLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState("");

  useEffect(() => {
    if (!map || !locating) return;
    const geolocation = navigator.geolocation;
    if (!geolocation) {
      setLocationStatus("A localização está indisponível. Use um navegador compatível em uma conexão segura.");
      setLocating(false);
      return;
    }

    let focused = false;
    return watchUserLocation(geolocation, (point, status) => {
      onPositionChange(point);
      setLocationStatus(status);
      if (point) {
        const outside = !isInJaboatao(point);
        const coverageChanged = outside !== viewingOutsideLocation.current;
        viewingOutsideLocation.current = outside;
        if (focused && !coverageChanged) return;
        focused = true;
        map.setView(point, map.getZoom(), { animate: false });
      }
    }, () => {
      if (viewingOutsideLocation.current) {
        viewingOutsideLocation.current = false;
        if (!isInJaboatao(map.getCenter())) map.setView(initialCenter, cameraZoom.initial);
      }
      setLocating(false);
    });
  }, [map, locating, onPositionChange]);

  useEffect(() => {
    if (!locating) return;
    function orient(event: DeviceOrientationEvent) {
      const compass = event as DeviceOrientationEvent & { webkitCompassHeading?: number };
      const bearing = compass.webkitCompassHeading ??
        (event.absolute && event.alpha !== null ? 360 - event.alpha : null);
      if (bearing === null || !Number.isFinite(bearing) || bearing < 0) return;
      heading.current = bearing + (screen.orientation?.angle ?? 0);
      locationArrow.current?.style.setProperty("--location-heading", `${heading.current}deg`);
    }
    window.addEventListener("deviceorientationabsolute", orient);
    window.addEventListener("deviceorientation", orient);
    return () => {
      window.removeEventListener("deviceorientationabsolute", orient);
      window.removeEventListener("deviceorientation", orient);
      heading.current = null;
    };
  }, [locating]);

  useEffect(() => {
    if (!map || !position) return;
    const arrow = document.createElement("span");
    arrow.className = "user-location-arrow";
    locationArrow.current = arrow;
    if (heading.current !== null) arrow.style.setProperty("--location-heading", `${heading.current}deg`);
    const marker = L.marker(position, {
      interactive: false, keyboard: false, title: following ? "Localização compartilhada" : "Minha localização",
      icon: L.divIcon({ className: "user-location-marker", html: arrow, iconSize: [20, 20], iconAnchor: [10, 10] }),
    }).addTo(map);
    return () => {
      locationArrow.current = null;
      marker.remove();
    };
  }, [following, map, position]);

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, {
      zoomControl: false, inertia: false, zoomSnap: 0.25,
      minZoom: cameraZoom.min, maxZoom: cameraZoom.max,
      attributionControl: false,
    });
    const areaPane = instance.createPane(incidentAreaPane);
    areaPane.style.zIndex = "390";
    areaPane.style.pointerEvents = "none";
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      noWrap: true, maxZoom: cameraZoom.max, maxNativeZoom: 19,
    });
    let hadError = false;
    let hadSuccess = false;
    tiles.on("loading", () => { hadError = false; hadSuccess = false; });
    tiles.on("tileerror", () => { hadError = true; });
    tiles.on("tileload", () => { hadSuccess = true; setTileError(false); });
    tiles.on("load", () => setTileError(hadError && !hadSuccess));
    tiles.addTo(instance);

    L.polygon(territory, {
      interactive: false, color: "#346ca5", weight: 2, opacity: 0.64, fill: false, dashArray: "3 7",
    }).addTo(instance);
    instance.setView(initialCenter, cameraZoom.initial);
    instance.on("zoomend", () => setZoom(instance.getZoom()));

    let lastInside: Location = initialCenter;
    let returning = false;
    instance.on("moveend", () => {
      const center = instance.getCenter();
      if (isInJaboatao(center)) {
        lastInside = center;
        returning = false;
        return;
      }
      if (following || viewingOutsideLocation.current) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (returning || reduceMotion) {
        returning = false;
        // Leaflet 1.9 supports reset at runtime but omits it from ZoomPanOptions.
        const resetOptions = { reset: true, animate: false };
        instance.setView(lastInside, instance.getZoom(), resetOptions);
        return;
      }
      returning = true;
      instance.panTo(lastInside, { animate: true, duration: 0.32, easeLinearity: 0.25 });
    });
    setMap(instance);
    return () => { instance.remove(); };
  }, [following]);

  useEffect(() => {
    if (map && target) map.setView(target, map.getZoom(), { animate: false });
  }, [map, target]);

  useEffect(() => {
    if (!map) return;
    map.setMinZoom(trip ? tripOverviewMinZoom : cameraZoom.min);
    if (!trip) return;
    const layers = L.layerGroup([
      L.polyline(trip.path, { interactive: false, color: "#fff", opacity: 0.96, weight: 10 }),
      L.polyline(trip.path, { interactive: false, color: "#1767d6", opacity: 0.96, weight: 6 }),
      L.circleMarker(trip.origin, { interactive: false, radius: 7, color: "#fff", weight: 3, fillColor: "#1767d6", fillOpacity: 1 }),
      L.circleMarker(trip.destination, { interactive: false, radius: 8, color: "#fff", weight: 3, fillColor: "#173b62", fillOpacity: 1 }),
    ]).addTo(map);
    fitTrip(map, trip);
    return () => { layers.remove(); };
  }, [map, trip]);

  useEffect(() => {
    if (following && map && position) map.setView(position, Math.max(map.getZoom(), 16), { animate: false });
  }, [following, map, position]);

  useEffect(() => {
    if (!map || following) return;
    function pick(event: L.LeafletMouseEvent) {
      const { lat, lng } = event.latlng;
      onPick(isInJaboatao({ lat, lng }) ? { lat, lng } : null);
    }
    map.on("click", pick);
    return () => { map.off("click", pick); };
  }, [following, map, onPick]);

  function pickCenter() {
    if (!map || following) return;
    const { lat, lng } = map.getCenter();
    onPick(isInJaboatao({ lat, lng }) ? { lat, lng } : null);
  }

  const markerSize = Math.max(30, 40 + (zoom - cameraZoom.min) * 3.5);
  const recenterLabel = position ? (following ? "Centralizar na localização compartilhada" : "Centralizar na minha localização")
    : trip ? "Mostrar rota inteira" : "Recentrar em Jaboatão";

  return <div className="map-shell" style={{ "--incident-pin-size": `${markerSize}px` } as CSSProperties}>
    <div ref={container} className="city-map" aria-label="Mapa de Jaboatão dos Guararapes e arredores"
      aria-describedby="map-keyboard-help" onKeyDown={event => {
        if (event.key === "Enter" && event.target === event.currentTarget) {
          event.preventDefault();
          pickCenter();
        }
      }} />
    <span className="sr-only" id="map-keyboard-help">{following ? "Use as setas para mover o mapa." :
      "Use as setas para mover o mapa e Enter para marcar uma ocorrência no centro."}</span>
    {map && incidents.map(incident => <MapPinLayer key={incident.id} map={map}
      location={incident} incident={incident} active={active?.id === incident.id} onOpen={onOpen} />)}
    {map && selected && <MapPinLayer map={map} location={selected} />}
    <div className="map-controls" aria-label="Controles do mapa">
      <div className="zoom-controls">
        <button type="button" aria-label="Aproximar mapa" disabled={!map || zoom >= cameraZoom.max}
          onClick={() => map?.zoomIn()}><Plus size={21} /></button>
        <button type="button" aria-label="Afastar mapa" disabled={!map || zoom <= (trip ? tripOverviewMinZoom : cameraZoom.min)}
          onClick={() => map?.zoomOut()}><Minus size={21} /></button>
      </div>
      <button className="recenter" type="button" aria-label={recenterLabel}
        title={recenterLabel} onClick={() => {
          if (!map) return;
          if (position) map.setView(position, map.getZoom());
          else if (trip) fitTrip(map, trip);
          else map.setView(initialCenter, cameraZoom.initial);
        }}><LocateFixed size={20} /></button>
      {!following && <button className="location-toggle" type="button" aria-label="Minha localização" aria-pressed={locating}
        title={locating ? "Parar de mostrar minha localização" : "Mostrar minha localização"} disabled={!map}
        onClick={() => {
          if (!locating) {
            const orientation = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
              requestPermission?: () => Promise<"granted" | "denied">;
            };
            void orientation?.requestPermission?.().catch(() => {});
          }
          if (locating && viewingOutsideLocation.current && map) {
            viewingOutsideLocation.current = false;
            if (!isInJaboatao(map.getCenter())) map.setView(initialCenter, cameraZoom.initial);
          }
          onPositionChange(null);
          setLocationStatus(locating ? "" : "Buscando sua localização…");
          setLocating(!locating);
        }}><Navigation size={20} aria-hidden="true" /></button>}
    </div>
    <div className="map-statuses">
      {tileError && <div className="tile-status" role="status">O mapa de ruas está indisponível.</div>}
      <div role="status">{locationStatus && <div className="tile-status">{locationStatus}</div>}</div>
    </div>
    <div className="map-credit"><a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> · <a href="https://github.com/tbrugz/geodata-br">Malha municipal</a></div>
  </div>;
}
