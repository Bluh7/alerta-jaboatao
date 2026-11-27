import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { ArrowUp, Minus, Shield } from "lucide-react";
import { chatQuestionLimit, type ChatMessage } from "../lib/incident-chat";
import { usePanelViewport } from "./use-panel-viewport";

const suggestions = [
  { label: "Últimos relatos", question: "Quais são as ocorrências mais recentes?" },
  { label: "E em Prazeres?", question: "O que foi registrado hoje em Prazeres?" },
];
const invitations = [
  ["Oi, eu sou o Juba! Vamos olhar o mapa juntos?", "Me diga um bairro e eu procuro os relatos das últimas 24 horas."],
  ["Quer um resumo de Jaboatão?", "Posso começar pelo que a comunidade registrou mais recentemente."],
  ["Tem algum lugar da cidade em mente?", "Me conte qual é. Posso conferir se há relatos desse bairro no mapa."],
  ["Oi! Quer entender uma ocorrência do mapa?", "Me diga o bairro e o tipo de ocorrência que chamou sua atenção."],
  ["Por onde a gente começa hoje?", "Posso olhar um bairro com você ou resumir os relatos da cidade."],
] as const;

function nextInvitation() {
  const count = invitations.length;
  let index = Math.floor(Math.random() * count);
  try {
    const key = "juba.ultimoConvite";
    const last = sessionStorage.getItem(key);
    if (last !== null && invitations[Number(last)]) index = (Number(last) + 1) % count;
    sessionStorage.setItem(key, String(index));
  } catch {
    // A escolha aleatória também funciona quando o armazenamento está bloqueado.
  }
  return invitations[index];
}
type ConversationMessage = ChatMessage & { sentAt: number };
const clock = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Recife", hour: "2-digit", minute: "2-digit" });
const calendar = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Recife", day: "numeric", month: "long", year: "numeric" });

function Bubble({ role, text, sentAt }: ConversationMessage) {
  return <div className={`chat-message chat-${role}`}>
    <p><span className="sr-only">{role === "user" ? "Você: " : "Juba: "}</span>{text}</p>
    <time dateTime={new Date(sentAt).toISOString()}>{clock.format(sentAt)}</time>
  </div>;
}
const requestError = "Não foi possível enviar a pergunta. Tente novamente.";
type Corner = { vertical: "top" | "bottom"; horizontal: "left" | "right" };
type Drag = { id: number; startX: number; startY: number; offsetX: number; offsetY: number; moved: boolean };

export function IncidentChat({ actionArea }: { actionArea: RefObject<HTMLDivElement | null> }) {
  const widget = useRef<HTMLDivElement>(null);
  const historyStart = useRef(0);
  const launcher = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [corner, setCorner] = useState<Corner>({ vertical: "top", horizontal: "left" });
  const [dragPosition, setDragPosition] = useState<{ left: number; top: number }>();
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState<"waiting" | "first" | "both" | "done">("waiting");
  const [pair, setPair] = useState<(typeof invitations)[number]>(invitations[0]);
  const pickedInvitation = useRef(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [startedAt, setStartedAt] = useState<number>();
  const followLatest = useRef(true);
  const [draft, setDraft] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState<ConversationMessage | null>(null);
  const [error, setError] = useState("");
  const dragging = dragPosition !== undefined;
  usePanelViewport(widget);

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (!pickedInvitation.current) {
      pickedInvitation.current = true;
      setPair(nextInvitation());
    }
    if (invite !== "waiting" && invite !== "first") return;
    const waiting = invite === "waiting";
    const timer = window.setTimeout(() => setInvite(waiting ? "first" : "both"), waiting ? 550 : 1800);
    return () => window.clearTimeout(timer);
  }, [invite]);

  useEffect(() => {
    const area = actionArea.current;
    const overlay = widget.current;
    if (!area || !overlay) return;

    const observer = new ResizeObserver(() => {
      const { top, height } = area.getBoundingClientRect();
      const occupied = height ? Math.max(0, overlay.getBoundingClientRect().bottom - top) : 0;
      overlay.style.setProperty("--chat-occupied-bottom", `${occupied}px`);
    });
    observer.observe(area);
    observer.observe(overlay);
    return () => observer.disconnect();
  }, [actionArea]);

  useEffect(() => {
    const log = conversation.current;
    if (log && followLatest.current) log.scrollTop = log.scrollHeight;
  }, [open, dragging, startedAt, messages, pendingQuestion, error]);

  useEffect(() => {
    if (!open) return;
    setStartedAt(current => current ?? Date.now());
    closeButton.current?.focus({ preventScroll: true });

    function dismissOutside(event: globalThis.PointerEvent) {
      if (event.target instanceof Node && !widget.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [open]);

  function closeChat() {
    setOpen(false);
    launcher.current?.focus({ preventScroll: true });
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    setInvite("done");
    const { left, top } = event.currentTarget.getBoundingClientRect();
    drag.current = {
      id: event.pointerId, startX: event.clientX, startY: event.clientY,
      offsetX: event.clientX - left, offsetY: event.clientY - top, moved: false,
    };
    suppressClick.current = false;
    if (event.nativeEvent.isTrusted) event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    const bounds = widget.current?.getBoundingClientRect();
    if (!current || current.id !== event.pointerId || !bounds) return;
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 6) return;

    current.moved = true;
    const { offsetWidth, offsetHeight } = event.currentTarget;
    setDragPosition({
      left: Math.max(0, Math.min(event.clientX - bounds.left - current.offsetX, bounds.width - offsetWidth)),
      top: Math.max(0, Math.min(event.clientY - bounds.top - current.offsetY, bounds.height - offsetHeight)),
    });
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    if (!current.moved) return;

    const bounds = widget.current?.getBoundingClientRect();
    if (event.type === "pointerup" && bounds) {
      const x = event.clientX - bounds.left - current.offsetX + event.currentTarget.offsetWidth / 2;
      const y = event.clientY - bounds.top - current.offsetY + event.currentTarget.offsetHeight / 2;
      setCorner({ vertical: y < bounds.height / 2 ? "top" : "bottom", horizontal: x < bounds.width / 2 ? "left" : "right" });
    }
    suppressClick.current = true;
    setDragPosition(undefined);
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      closeChat();
      return;
    }
    if (event.target !== launcher.current) return;
    switch (event.key) {
      case "Enter": if (!event.repeat) setOpen(current => !current); break;
      case "ArrowUp": setCorner(current => ({ ...current, vertical: "top" })); break;
      case "ArrowDown": setCorner(current => ({ ...current, vertical: "bottom" })); break;
      case "ArrowLeft": setCorner(current => ({ ...current, horizontal: "left" })); break;
      case "ArrowRight": setCorner(current => ({ ...current, horizontal: "right" })); break;
      default: return;
    }
    setInvite("done");
    event.preventDefault();
    event.stopPropagation();
  }

  async function ask(question: string) {
    const message = question.trim();
    if (!message || request.current) return;

    const controller = new AbortController();
    request.current = controller;
    const outgoing: ConversationMessage = { role: "user", text: message, sentAt: Date.now() };
    followLatest.current = true;
    setDraft("");
    setPendingQuestion(outgoing);
    setError("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: messages.slice(historyStart.current).map(({ role, text }) => ({ role, text })),
        }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!response.ok || typeof body?.reply !== "string" || !body.reply.trim()) {
        setDraft(message);
        setError(typeof body?.error === "string" ? body.error : requestError);
        return;
      }
      const omitted = Number(response.headers.get("X-Chat-History-Omitted"));
      if (Number.isInteger(omitted) && omitted > 0 && omitted % 2 === 0 && omitted <= messages.length - historyStart.current) {
        historyStart.current += omitted;
      }
      setMessages(current => [...current, outgoing, { role: "assistant", text: body.reply, sentAt: Date.now() }]);
    } catch {
      if (!controller.signal.aborted) {
        setDraft(message);
        setError(requestError);
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPendingQuestion(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(draft);
  }

  return <div className="assistant-widget" ref={widget} data-vertical={corner.vertical} data-horizontal={corner.horizontal}
    onKeyDown={handleKey}>
    <button type="button" className="chat-toggle" ref={launcher} aria-controls="incident-chat" aria-expanded={open}
      aria-label="Conversa com Juba" title="Conversa com Juba" aria-description="Use as setas do teclado para mover o botão entre os cantos."
      style={dragPosition} data-dragging={dragging ? true : undefined}
      onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
      onClick={event => {
        setInvite("done");
        if (!suppressClick.current || event.detail === 0) setOpen(current => !current);
      }}>
      <svg className="chat-bubble-shape" viewBox="0 0 64 54" aria-hidden="true" focusable="false">
        <path d="M16 3h32q14 0 14 14v13q0 14-14 14H14q-3 0-5 1l-5 2q-2 1-2-1V17Q2 3 16 3Z" />
      </svg>
      <Image src="/mascote-assistente.svg" alt="" width={35} height={35} draggable={false} />
      <span className="chat-launch-dots" aria-hidden="true"><i /><i /><i /></span>
    </button>
    {(invite === "first" || invite === "both") && <button type="button" className="chat-invite" aria-controls="incident-chat"
      data-complete={invite === "both"} aria-live="polite"
      onAnimationEnd={event => { if (event.target === event.currentTarget) setInvite("done"); }}
      onClick={() => { setInvite("done"); setOpen(true); }}>
      <span className="chat-invite-message"><strong>Juba</strong>{pair[0]}</span>
      {invite === "both" && <span className="chat-invite-message">{pair[1]}</span>}
    </button>}
    <section className="incident-assistant" id="incident-chat" aria-labelledby="chat-heading" hidden={!open || dragging}>
      <header className="chat-header">
        <span className="chat-avatar"><Image src="/mascote-assistente.svg" width={38} height={38} alt="" draggable={false} /></span>
        <div>
          <h2 id="chat-heading">Juba</h2>
          <p>Assistente de IA do Alerta Jaboatão</p>
        </div>
        <button type="button" className="chat-minimize" aria-label="Minimizar conversa" ref={closeButton}
          onClick={closeChat}><Minus size={20} aria-hidden="true" /></button>
      </header>
      <div className="chat-content" ref={conversation} onScroll={({ currentTarget }) => {
        followLatest.current = currentTarget.scrollHeight - currentTarget.scrollTop - currentTarget.clientHeight < 40;
      }}>
        <div className="chat-messages" role="log" aria-label="Mensagens com Juba">
          {startedAt && <>
            <p className="chat-day">{calendar.format(startedAt)}</p>
            {pair.map(text => <Bubble key={text} role="assistant" sentAt={startedAt} text={text} />)}
          </>}
          {messages.map((entry, index) => <div className="chat-turn" key={index}>
            {calendar.format(entry.sentAt) !== calendar.format(messages[index - 1]?.sentAt ?? startedAt ?? entry.sentAt) &&
              <p className="chat-day">{calendar.format(entry.sentAt)}</p>}
            <Bubble {...entry} />
          </div>)}
          {pendingQuestion && <>
            <Bubble {...pendingQuestion} />
            <p className="chat-typing"><span aria-hidden="true"><i /><i /><i /></span>Juba está consultando o mapa…</p>
          </>}
        </div>
        {!messages.length && !pendingQuestion && !error && <div className="chat-suggestions" aria-label="Sugestões de mensagem">
          {suggestions.map(({ label, question }) => <button key={question} type="button" onClick={() => void ask(question)}>{label}</button>)}
        </div>}
        {error && <p className="chat-error" role="alert">{error}</p>}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <div className="chat-composer">
          <label htmlFor="chat-question" className="sr-only">Pergunta sobre ocorrências</label>
          <textarea id="chat-question" rows={1} value={draft} onChange={event => setDraft(event.target.value)} maxLength={chatQuestionLimit}
            onKeyDown={event => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              void ask(draft);
            }}
            placeholder="Mensagem para Juba…" aria-describedby="chat-privacy" readOnly={Boolean(pendingQuestion)} />
          <button type="submit" aria-label="Enviar pergunta" disabled={!draft.trim() || Boolean(pendingQuestion)}>
            <ArrowUp size={21} aria-hidden="true" />
          </button>
        </div>
        <p id="chat-privacy"><Shield size={12} aria-hidden="true" />Evite incluir dados pessoais.</p>
      </form>
    </section>
  </div>;
}
