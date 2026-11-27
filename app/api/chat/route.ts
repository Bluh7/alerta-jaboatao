import { ApiError, FunctionCallingConfigMode, GoogleGenAI } from "@google/genai";
import { chatHistoryTokenLimit, chatQuestionLimit, chatReplyLimit } from "../../../src/lib/incident-chat";
import { incidentSearch, parseChatInput, recentIncidentResult, systemInstruction } from "../../../src/server/incident-chat";
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
    const ai = new GoogleGenAI({ apiKey, enterprise: false });
    const model = "gemini-3.5-flash-lite";
    const config = { abortSignal: request.signal, httpOptions: { timeout: 15_000 } };
    const contents = messages.map(({ role, text }) => ({
      role: role === "assistant" ? "model" : role,
      parts: [{ text }],
    }));
    const history = contents.slice(0, -1);
    let omittedTurns = 0;
    let end = history.length / 2;
    if (end > 0 && !(await fits(0))) {
      omittedTurns = 1;
      while (omittedTurns < end) {
        const middle = Math.floor((omittedTurns + end) / 2);
        if (await fits(middle)) end = middle;
        else omittedTurns = middle + 1;
      }
    }

    async function fits(omittedTurns: number) {
      const { totalTokens } = await ai.models.countTokens({
        model, contents: history.slice(omittedTurns * 2), config,
      });
      if (totalTokens === undefined) throw new Error("Gemini did not return a token count");
      return totalTokens < chatHistoryTokenLimit;
    }

    const conversation = contents.slice(omittedTurns * 2);
    const generation = {
      ...config, systemInstruction, maxOutputTokens: 600,
      tools: [{ functionDeclarations: [incidentSearch] }],
    };
    let response = await ai.models.generateContent({ model, contents: conversation, config: generation });
    const calls = response.functionCalls;
    if (calls?.length) {
      const turn = response.candidates?.[0].content;
      if (!turn || calls.some(call => call.name !== incidentSearch.name)) {
        return error("O assistente solicitou uma consulta desconhecida.", 502);
      }
      const result = await recentIncidentResult(await incidentStore.list(readIncidentViewer(request)));
      response = await ai.models.generateContent({
        model,
        contents: [...conversation, turn, {
          role: "user",
          parts: calls.map(call => ({
            functionResponse: { name: incidentSearch.name, id: call.id, response: result },
          })),
        }],
        config: {
          ...generation,
          toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.NONE } },
        },
      });
    }
    const reply = response.text?.trim().slice(0, chatReplyLimit);
    if (!reply) return error("Não foi possível responder a essa pergunta. Tente reformulá-la.", 502);
    return Response.json({ reply }, { headers: {
      "Cache-Control": "private, no-store",
      "X-Chat-History-Omitted": String(omittedTurns * 2),
    } });
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 429) {
      return error("O assistente atingiu o limite de consultas. Tente novamente mais tarde.", 429);
    }
    return error("Não foi possível consultar o assistente agora. Tente novamente mais tarde.", 503);
  }
}
