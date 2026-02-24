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

interface MessagePart {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
}

function formatToolResultOutput(output: unknown): string[] {
  if (
    typeof output === "object" &&
    output !== null &&
    "type" in output &&
    output.type === "text" &&
    "text" in output
  ) {
    return ["```", String((output as { text: string }).text), "```"];
  }
  return ["```json", JSON.stringify(output, null, 2), "```"];
}

function formatMessagePart(part: TextPart | MessagePart): string[] {
  if (part.type === "text" && part.text?.trim()) {
    return [part.text, ""];
  }
  if (part.type === "tool-call") {
    return [
      `**Tool Call**: ${part.toolName}`,
      `**Call ID**: ${part.toolCallId}`,
      "**Input**:",
      "```json",
      JSON.stringify(part.input, null, 2),
      "```",
      "",
    ];
  }
  if (part.type === "tool-result") {
    return [
      `**Tool Result**: ${part.toolName}`,
      `**Call ID**: ${part.toolCallId}`,
      "**Output**:",
      ...formatToolResultOutput(part.output),
      "",
    ];
  }
  if (part.type === "tool-error") {
    return [
      `**Tool Error**: ${part.toolName}`,
      `**Call ID**: ${part.toolCallId}`,
      "**Error**:",
      "```",
      String(part.output),
      "```",
      "",
    ];
  }
  return [];
}

export function generateMarkdown(history: ConversationHistory): string {
  const lines: string[] = [
    `# ${history.title}`,
    "",
    "## Conversation Metadata",
    `- **Session ID**: ${history.sessionId}`,
    `- **Model**: ${history.modelId}`,
    `- **Created**: ${history.createdAt.toISOString()}`,
    `- **Last Updated**: ${history.updatedAt.toISOString()}`,
    `- **Total Messages**: ${history.messages.length}`,
    "",
    "## Conversation History",
    "",
  ];

  history.messages.forEach((message: ModelMessage, index: number) => {
    const role = message.role.toUpperCase();
    lines.push(`### ${role} (Message ${index + 1})`);
    lines.push("");

    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        lines.push(...formatMessagePart(part as TextPart | MessagePart));
      }
    } else if (typeof message.content === "string" && message.content.trim()) {
      lines.push(message.content);
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  });

  return lines.join("\n");
}
