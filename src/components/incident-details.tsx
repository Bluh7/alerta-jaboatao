import { useEffect, useRef, useState, type FormEvent } from "react";
import { EyeOff, Heart, MessageCircle, Pencil, Send, Trash2, X } from "lucide-react";
import { categories, categoryKeys, type Category, type Incident, type IncidentChange, type IncidentThread } from "../lib/incidents";
import { IncidentIcon } from "./incident-icon";
import { usePanelViewport } from "./use-panel-viewport";

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short", timeStyle: "short", timeZone: "America/Recife",
});
const chatTime = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit", minute: "2-digit", timeZone: "America/Recife",
});

function incidentPath(id: string) {
  return `/api/incidents/${encodeURIComponent(id)}`;
}

export async function changeIncident(id: string, change: IncidentChange): Promise<IncidentThread | null> {
  let options: RequestInit;
  if (change.action === "delete") {
    options = { method: "DELETE" };
  } else {
    const editing = change.action === "edit";
    options = {
      method: editing ? "PUT" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing ? { category: change.category, description: change.description } : change),
    };
  }
  const response = await fetch(incidentPath(id), options);
  if (response.status === 204) return null;
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || "Não foi possível atualizar a ocorrência.");
  return result;
}

export function IncidentDetails({ incident, onClose, onUpdate, onHide }: {
  incident: Incident;
  onClose: () => void;
  onUpdate: (incident: Incident) => void;
  onHide: (id: string, reason: "ignore" | "delete" | "missing") => void;
}) {
  const [thread, setThread] = useState<IncidentThread | null>(null);
  const [mode, setMode] = useState<"view" | "chat" | "edit" | "delete">("view");
  const [category, setCategory] = useState(incident.category);
  const [description, setDescription] = useState(incident.description);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [threadError, setThreadError] = useState(false);
  const pending = useRef(false);
  const readRequest = useRef<AbortController | null>(null);
  const chatLog = useRef<HTMLOListElement>(null);
  const panel = useRef<HTMLElement>(null);
  const current = thread?.incident ?? incident;
  usePanelViewport(panel);

  useEffect(() => {
    async function refresh() {
      if (pending.current || readRequest.current) return;
      const controller = new AbortController();
      readRequest.current = controller;
      try {
        const response = await fetch(incidentPath(incident.id), { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 404) {
          onHide(incident.id, "missing");
          return;
        }
        if (!response.ok) throw new Error();
        const result: IncidentThread = await response.json();
        if (!controller.signal.aborted) {
          setThread(result);
          setThreadError(false);
        }
      } catch {
        if (!controller.signal.aborted) setThreadError(true);
      } finally {
        if (readRequest.current === controller) readRequest.current = null;
      }
    }
    void refresh();
    const interval = window.setInterval(refresh, 5000);
    return () => {
      window.clearInterval(interval);
      readRequest.current?.abort();
      readRequest.current = null;
    };
  }, [incident.id, onHide]);

  const messageCount = thread?.messages.length ?? 0;
  useEffect(() => {
    const log = chatLog.current;
    if (log && mode === "chat") log.scrollTop = log.scrollHeight;
  }, [mode, messageCount]);

  async function change(update: IncidentChange) {
    if (pending.current) return;
    pending.current = true;
    readRequest.current?.abort();
    readRequest.current = null;
    setWorking(true);
    setError("");
    try {
      const result = await changeIncident(incident.id, update);
      if (update.action === "delete" || (update.action === "ignore" && update.value)) {
        onHide(incident.id, update.action);
      } else if (result) {
        setThread(result);
        setThreadError(false);
        if (update.action === "edit") {
          onUpdate(result.incident);
          setMode("view");
        }
        if (update.action === "message") setMessage("");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Tente novamente em instantes.");
    } finally {
      pending.current = false;
      setWorking(false);
    }
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (message.trim()) void change({ action: "message", text: message });
  }

  return <section className="action-sheet incident-detail-sheet" aria-labelledby="incident-heading" ref={panel}>
    <div className="sheet-header">
      <div className="incident-detail-heading">
        <IncidentIcon category={current.category} />
        <div className="incident-details">
          <h2 id="incident-heading">{categories[current.category].label}</h2>
          <p>Registrada em {dateFormat.format(new Date(current.createdAt))}</p>
        </div>
      </div>
      <button type="button" className="close-button" aria-label="Fechar ocorrência" onClick={onClose}><X size={20} /></button>
    </div>
    {(current.locationLabel || incident.locationLabel) && <p>{current.locationLabel || incident.locationLabel}</p>}
    {current.description && <p className="incident-description">{current.description}</p>}

    <div className="incident-actions">
      <button type="button" aria-pressed={Boolean(current.likedByMe)} disabled={working}
        onClick={() => void change({ action: "like", value: !current.likedByMe })}>
        <Heart size={18} fill={current.likedByMe ? "currentColor" : "none"} aria-hidden="true" /> Curtir <span>{current.likeCount ?? 0}</span>
      </button>
      <button type="button" aria-expanded={mode === "chat"} aria-controls={mode === "chat" ? "incident-chat" : undefined}
        disabled={working} onClick={() => { setMode(mode === "chat" ? "view" : "chat"); setError(""); }}>
        <MessageCircle size={18} aria-hidden="true" /> Chat <span>{current.messageCount ?? 0}</span>
      </button>
      {current.isOwner ? <>
        <button type="button" disabled={working} onClick={() => {
          setCategory(current.category);
          setDescription(current.description);
          setMode("edit");
          setError("");
        }}><Pencil size={17} aria-hidden="true" /> Editar</button>
        <button type="button" className="incident-danger" disabled={working} onClick={() => { setMode("delete"); setError(""); }}>
          <Trash2 size={18} aria-hidden="true" /> Remover
        </button>
      </> : <button type="button" disabled={working} onClick={() => void change({ action: "ignore", value: true })}>
        <EyeOff size={18} aria-hidden="true" /> Ignorar
      </button>}
    </div>

    {mode === "chat" && <div id="incident-chat" className="incident-chat">
      {threadError && <p role="status">Não foi possível atualizar as mensagens.</p>}
      {!thread && !threadError && <p role="status">Carregando conversa…</p>}
      {thread && thread.messages.length === 0 && <p>Ainda não há mensagens. Inicie a conversa.</p>}
      {thread && thread.messages.length > 0 && <ol className="incident-messages" role="log" aria-label="Mensagens da ocorrência" ref={chatLog}>
        {thread.messages.map(item => <li key={item.id} className={item.isMine ? "message-mine" : undefined}>
          <div><strong>{item.isMine ? "Você" : item.author}</strong>
            <time dateTime={item.createdAt}>{chatTime.format(new Date(item.createdAt))}</time></div>
          <p>{item.text}</p>
        </li>)}
      </ol>}
      <form className="incident-chat-form" onSubmit={send}>
        <textarea aria-label="Mensagem" placeholder="Escreva uma mensagem" rows={1} value={message} maxLength={500}
          onChange={event => setMessage(event.target.value)} disabled={working} />
        <button type="submit" className="route-submit" aria-label="Enviar mensagem" disabled={working || !message.trim()}>
          <Send size={17} aria-hidden="true" />
        </button>
      </form>
    </div>}

    {mode === "edit" && <form className="incident-edit" onSubmit={event => {
      event.preventDefault();
      void change({ action: "edit", category, description });
    }}>
      <label>Tipo de ocorrência
        <select value={category} disabled={working} onChange={event => setCategory(event.target.value as Category)}>
          {categoryKeys.map(key => <option key={key} value={key}>{categories[key].label}</option>)}
        </select>
      </label>
      <label>Descrição
        <textarea rows={3} value={description} maxLength={280} disabled={working}
          onChange={event => setDescription(event.target.value)} />
      </label>
      <div className="incident-form-buttons">
        <button type="button" disabled={working} onClick={() => setMode("view")}>Cancelar</button>
        <button type="submit" className="route-submit" disabled={working}>Salvar alterações</button>
      </div>
    </form>}

    {mode === "delete" && <div className="incident-delete">
      <p>Remover a ocorrência e sua conversa do mapa?</p>
      <div className="incident-form-buttons">
        <button type="button" disabled={working} onClick={() => setMode("view")}>Cancelar</button>
        <button type="button" className="incident-delete-confirm" disabled={working}
          onClick={() => void change({ action: "delete" })}>Confirmar remoção</button>
      </div>
    </div>}
    {error && <p className="incident-error" role="alert">{error}</p>}
  </section>;
}
