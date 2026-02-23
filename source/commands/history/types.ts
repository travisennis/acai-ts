import type { ModelMessage } from "ai";

// Compact token usage format stored in session files
export interface SessionTokenUsage {
  total: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number;
    reasoningTokens: number;
    estimatedCost: number;
  };
  lastTurn: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number;
    reasoningTokens: number;
    estimatedCost: number;
  };
}

// Legacy per-turn token usage format (deprecated)
export interface TokenUsageTurn {
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
}

export interface ConversationHistory {
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ModelMessage[];
  sessionId: string;
  modelId: string;
  project: string;
  tokenUsage?: SessionTokenUsage | TokenUsageTurn[];
}
