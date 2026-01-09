import { writeFile } from "node:fs/promises";
import type { ModelMessage, TextPart } from "ai";
import type { ConversationHistory } from "./types.ts";

export async function exportConversation(
  history: ConversationHistory,
): Promise<string> {
  const sanitizedTitle = history.title
    .replace(/[^a-zA-Z0-9\s-_]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const filename = `${sanitizedTitle}_${timestamp}.md`;

  const markdownContent = generateMarkdown(history);

  await writeFile(filename, markdownContent);
  return filename;
}

export function generateMarkdown(history: ConversationHistory): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${history.title}`);
  lines.push("");
  lines.push("## Conversation Metadata");
  lines.push(`- **Session ID**: ${history.sessionId}`);
  lines.push(`- **Model**: ${history.modelId}`);
  lines.push(`- **Created**: ${history.createdAt.toISOString()}`);
  lines.push(`- **Last Updated**: ${history.updatedAt.toISOString()}`);
  lines.push(`- **Total Messages**: ${history.messages.length}`);
  lines.push("");

  // Messages
  lines.push("## Conversation History");
  lines.push("");

  history.messages.forEach((message: ModelMessage, index: number) => {
    const role = message.role.toUpperCase();
    lines.push(`### ${role} (Message ${index + 1})`);
    lines.push("");

    if (Array.isArray(message.content)) {
      message.content.forEach(
        (
          part:
            | TextPart
            | {
                type: string;
                text?: string;
                toolCallId?: string;
                toolName?: string;
                input?: unknown;
                output?: unknown;
              },
        ) => {
          if (part.type === "text" && part.text?.trim()) {
            lines.push(part.text);
            lines.push("");
          } else if (part.type === "tool-call") {
            lines.push(`**Tool Call**: ${part.toolName}`);
            lines.push(`**Call ID**: ${part.toolCallId}`);
            lines.push("**Input**:");
            lines.push("```json");
            lines.push(JSON.stringify(part.input, null, 2));
            lines.push("```");
            lines.push("");
          } else if (part.type === "tool-result") {
            lines.push(`**Tool Result**: ${part.toolName}`);
            lines.push(`**Call ID**: ${part.toolCallId}`);
            lines.push("**Output**:");
            if (
              typeof part.output === "object" &&
              part.output !== null &&
              "type" in part.output &&
              part.output.type === "text" &&
              "text" in part.output
            ) {
              lines.push("```");
              lines.push(String((part.output as { text: string }).text));
              lines.push("```");
            } else {
              lines.push("```json");
              lines.push(JSON.stringify(part.output, null, 2));
              lines.push("```");
            }
            lines.push("");
          } else if (part.type === "tool-error") {
            lines.push(`**Tool Error**: ${part.toolName}`);
            lines.push(`**Call ID**: ${part.toolCallId}`);
            lines.push("**Error**:");
            lines.push("```");
            lines.push(String(part.output));
            lines.push("```");
            lines.push("");
          }
        },
      );
    } else if (typeof message.content === "string" && message.content.trim()) {
      lines.push(message.content);
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  });

  return lines.join("\n");
}
