import type { ModelMessage, TextPart } from "ai";

export function extractLastAssistantText(
  messages: ModelMessage[],
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as ModelMessage | undefined;
    if (!msg) continue;
    if (msg.role !== "assistant") continue;
    if (!("content" in msg) || !Array.isArray(msg.content)) continue;

    for (let j = msg.content.length - 1; j >= 0; j--) {
      const part = msg.content[j];
      if (
        part &&
        part.type === "text" &&
        typeof (part as TextPart).text === "string"
      ) {
        const text = (part as TextPart).text;
        if (text.trim().length > 0) return text;
      }
    }
  }
  return null;
}
