import type { ModelMessage, TextPart } from "ai";

function findLastNonEmptyText(content: Array<{ type: string }>): string | null {
  for (let j = content.length - 1; j >= 0; j--) {
    const part = content[j];
    if (part?.type !== "text") continue;
    const text = (part as TextPart).text;
    if (typeof text === "string" && text.trim().length > 0) return text;
  }
  return null;
}

export function extractLastAssistantText(
  messages: ModelMessage[],
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as ModelMessage | undefined;
    if (msg?.role !== "assistant") continue;
    if (!("content" in msg) || !Array.isArray(msg.content)) continue;

    const text = findLastNonEmptyText(msg.content);
    if (text !== null) return text;
  }
  return null;
}
