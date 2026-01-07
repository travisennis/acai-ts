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

export type ToolExecutionOptions = {
  toolCallId: string;
  // biome-ignore lint/suspicious/noExplicitAny: temporary
  messages?: any[];
  abortSignal?: AbortSignal;
};
