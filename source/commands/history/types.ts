import type { ModelMessage } from "ai";

export interface ConversationHistory {
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ModelMessage[];
  sessionId: string;
  modelId: string;
  project: string;
}
