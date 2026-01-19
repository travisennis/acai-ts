import type { ModelMessage } from "ai";

export interface ConversationHistory {
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ModelMessage[];
  sessionId: string;
  modelId: string;
  project: string;
  tokenUsage?: {
    stepIndex: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number;
    reasoningTokens: number;
    inputTokenDetails: {
      noCacheTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
    };
    outputTokenDetails: {
      textTokens: number;
      reasoningTokens: number;
    };
    timestamp: number;
    estimatedCost: number;
  }[];
}
