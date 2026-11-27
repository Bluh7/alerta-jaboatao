import { ApiError, GoogleGenAI } from "@google/genai";
import { chatQuestionLimit, chatReplyLimit } from "../../../src/lib/incident-chat";
import { buildIncidentChatPrompt, parseChatInput } from "../../../src/server/incident-chat";
import { incidentStore } from "../../../src/server/incident-store";
import { readIncidentViewer } from "../../../src/server/incident-viewer";

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return error("Envie a pergunta em JSON.", 415);

  const messages = parseChatInput(await request.json().catch(() => null));
  if (!messages) return error(`Envie uma pergunta de até ${chatQuestionLimit} caracteres e um histórico válido.`, 400);

  const apiKey = process.env.GEMINI_KEY?.trim();
  if (!apiKey) return error("O assistente está indisponível no momento.", 503);

  try {
    const incidents = await incidentStore.list(readIncidentViewer(request));
    const systemInstruction = await buildIncidentChatPrompt(incidents);
    const ai = new GoogleGenAI({ apiKey, enterprise: false });
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: messages.map(({ role, text }) => ({ role: role === "assistant" ? "model" : role, parts: [{ text }] })),
      config: {
        systemInstruction,
        maxOutputTokens: 600,
        abortSignal: request.signal,
        httpOptions: { timeout: 15_000 },
      },
    });
    const reply = response.text?.trim().slice(0, chatReplyLimit);
    if (!reply) return error("Não foi possível responder a essa pergunta. Tente reformulá-la.", 502);
    return Response.json({ reply }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 429) {
      return error("O assistente atingiu o limite de consultas. Tente novamente mais tarde.", 429);
    }
    return error("Não foi possível consultar o assistente agora. Tente novamente mais tarde.", 503);
  }
}
