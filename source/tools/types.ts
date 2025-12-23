import { z } from "zod";

export const fileEncodingSchema = z.enum([
  "ascii",
  "utf8",
  "utf-8",
  "utf16le",
  "ucs2",
  "ucs-2",
  "base64",
  "base64url",
  "latin1",
  "binary",
  "hex",
]);

interface BaseMessage {
  name: string;
  id: string;
  retry?: number;
}

interface ToolInitMessage extends BaseMessage {
  event: "tool-init";
  data: string;
}

interface ToolUpdateMessage extends BaseMessage {
  event: "tool-update";
  data: string;
}

interface ToolErrorMessage extends BaseMessage {
  event: "tool-error";
  data: string;
}

interface ToolCompletionMessage extends BaseMessage {
  event: "tool-completion";
  data: string;
}

type Message =
  | ToolInitMessage
  | ToolUpdateMessage
  | ToolErrorMessage
  | ToolCompletionMessage;

export type ToolResult = Message | string;

export function isToolMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Message> & {
    event?: unknown;
    id?: unknown;
  };
  return (
    typeof candidate.event === "string" &&
    typeof candidate.id === "string" &&
    ("data" in candidate || "retry" in candidate)
  );
}

export type ToolCallOptions = {
  toolCallId: string;
  // biome-ignore lint/suspicious/noExplicitAny: temporary
  messages?: any[];
  abortSignal?: AbortSignal;
};
