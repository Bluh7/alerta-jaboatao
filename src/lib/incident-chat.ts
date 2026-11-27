export type ChatMessage = { role: "user" | "assistant"; text: string };

export const chatQuestionLimit = 1000;
export const chatReplyLimit = 4000;
export const chatHistoryTokenLimit = 5000;
