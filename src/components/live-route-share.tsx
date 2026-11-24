import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Copy, Radio, Square } from "lucide-react";
import { routeShareUrl } from "../lib/shared-route";
import type { Location } from "../lib/territory";
import type { TravelMode, TripPreview } from "../lib/trip";

type Session = { id: string; secret: string };

function stopSession({ id, secret }: Session) {
  void fetch(`/api/live-routes/${id}`, {
    method: "DELETE", headers: { "X-Live-Secret": secret }, keepalive: true,
  }).catch(() => {});
}

export function LiveRouteShare({ position, route, mode }: {
  position: Location | null;
  route: TripPreview;
  mode: TravelMode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState("");
  const latest = useRef<Location | null>(null);
  const mounted = useRef(false);
  const canShare = position !== null;

  useEffect(() => {
    latest.current = position;
  }, [position]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!session) return;
    if (!canShare) {
      setStatus("Compartilhamento encerrado porque a localização ficou indisponível.");
      setSession(null);
      return;
    }

    let running = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function publish({ id, secret }: Session) {
      const point = latest.current;
      if (!running || !point) return;
      try {
        const response = await fetch(`/api/live-routes/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-Live-Secret": secret },
          body: JSON.stringify(point),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]),
        });
        if (!running) return;
        if (response.status === 404) {
          setStatus("Compartilhamento encerrado. Você pode iniciar um novo.");
          setSession(null);
          return;
        }
        setStatus(response.ok ? "" : "Reconectando o compartilhamento…");
      } catch {
        if (running) setStatus("Reconectando o compartilhamento…");
      }
      if (running) timer = setTimeout(() => void publish({ id, secret }), 4_000);
    }
    timer = setTimeout(() => void publish(session), 4_000);
    const onPageHide = () => stopSession(session);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      running = false;
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("pagehide", onPageHide);
      stopSession(session);
    };
  }, [canShare, session]);

  async function start() {
    if (!position || starting) return;
    setStarting(true);
    setStatus("");
    try {
      const response = await fetch("/api/live-routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route: new URL(routeShareUrl(window.location.href, route, mode)).hash, position }),
      });
      if (!response.ok) throw new Error();
      const created: Session = await response.json();
      if (mounted.current && latest.current) setSession(created);
      else stopSession(created);
    } catch {
      if (mounted.current) setStatus("Não foi possível iniciar o compartilhamento ao vivo.");
    } finally {
      if (mounted.current) setStarting(false);
    }
  }

  const link = session && canShare ? new URL(`/ao-vivo/${session.id}`, window.location.origin).href : "";

  return <div className={link ? "live-route-share is-live" : "live-route-share"}>
    {link ? <>
      <div className="live-share-heading"><Radio size={20} aria-hidden="true" /><strong>Compartilhamento ao vivo ativo</strong></div>
      <p>Mantenha a rota aberta e a localização ligada para atualizar sua posição.</p>
      <input className="route-share-link" aria-label="Link de acompanhamento ao vivo" readOnly value={link}
        onFocus={event => event.currentTarget.select()} />
      <div className="live-share-controls">
        <button type="button" className="live-copy" onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setStatus("Link ao vivo copiado.");
          } catch {
            setStatus("Selecione o link acima para copiá-lo.");
          }
        }}>{status === "Link ao vivo copiado." ? <Check size={16} /> : <Copy size={16} />} Copiar link ao vivo</button>
        <button type="button" className="live-stop" aria-label="Encerrar compartilhamento ao vivo" onClick={() => {
          setSession(null);
          setStatus("");
        }}><Square size={13} aria-hidden="true" /> Encerrar</button>
      </div>
    </> : <>
      <button type="button" className="live-share-start" disabled={!canShare || starting} onClick={() => void start()}>
        <span className="live-share-icon"><Radio size={20} aria-hidden="true" /></span>
        <span><strong>{starting ? "Iniciando…" : "Compartilhar ao vivo"}</strong>
          <small>{canShare ? "Quem tiver o link poderá acompanhar sua posição." : "Ative sua localização para compartilhar ao vivo."}</small>
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </>}
    {status && <p role="status">{status}</p>}
  </div>;
}
