import { openai as originalOpenAi } from "@ai-sdk/openai";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

const openaiModels = {
  "chatgpt-4o-latest": originalOpenAi("chatgpt-4o-latest"),
  "gpt-4o": originalOpenAi("gpt-4o-2024-11-20"),
  "gpt-4o-mini": originalOpenAi("gpt-4o-mini"),
  "gpt-4o-structured": originalOpenAi("gpt-4o-2024-11-20", {
    structuredOutputs: true,
  }),
  "gpt-4o-mini-structured": originalOpenAi("gpt-4o-mini", {
    structuredOutputs: true,
  }),
  o1: originalOpenAi("o1"),
  "o1-pro": originalOpenAi("o1-pro-2025-03-19"),
  "o1-mini": originalOpenAi("o1-mini"),
  "o3-mini": originalOpenAi("o3-mini"),
  "gpt-4-1": originalOpenAi("gpt-4.1"),
  "gpt-4-5": originalOpenAi("gpt-4.5-preview"),
  o3: originalOpenAi.responses("o3"),
  "o4-mini": originalOpenAi.responses("o4-mini"),
  "codex-mini": originalOpenAi("codex-mini-latest"),
} as const;

type ModelName = `openai:${keyof typeof openaiModels}`;

export const openaiModelNames: ModelName[] = objectKeys(openaiModels).map(
  (key) => `openai:${key}` as const,
);

export const openaiProvider = {
  openai: customProvider({
    languageModels: openaiModels,
    fallbackProvider: originalOpenAi,
  }),
};

export const openaiModelRegistry: {
  [K in ModelName]: ModelMetadata<ModelName>;
} = {
  "openai:chatgpt-4o-latest": {
    id: "openai:chatgpt-4o-latest",
    provider: "openai",
    contextWindow: 128000,
    maxOutputTokens: 16384,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.0000025,
    costPerOutputToken: 0.00001,
    category: "balanced",
  },
  "openai:gpt-4o": {
    id: "openai:gpt-4o",
    provider: "openai",
    contextWindow: 128000,
    maxOutputTokens: 16384,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.0000025,
    costPerOutputToken: 0.00001,
    category: "balanced",
  },
  "openai:gpt-4o-mini": {
    id: "openai:gpt-4o-mini",
    provider: "openai",
    contextWindow: 128000,
    maxOutputTokens: 16384,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.00000015,
    costPerOutputToken: 0.0000006,
    category: "fast",
  },
  "openai:gpt-4o-structured": {
    id: "openai:gpt-4o-structured",
    provider: "openai",
    contextWindow: 128000,
    maxOutputTokens: 16384,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.0000025,
    costPerOutputToken: 0.00001,
    category: "balanced",
  },
  "openai:gpt-4o-mini-structured": {
    id: "openai:gpt-4o-mini-structured",
    provider: "openai",
    contextWindow: 128000,
    maxOutputTokens: 16384,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.00000015,
    costPerOutputToken: 0.0000006,
    category: "fast",
  },
  "openai:o1": {
    id: "openai:o1",
    provider: "openai",
    contextWindow: 200000,
    maxOutputTokens: 100000,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: false,
    costPerInputToken: 0.000015,
    costPerOutputToken: 0.00006,
    category: "powerful",
  },
  "openai:o1-pro": {
    id: "openai:o1-pro",
    provider: "openai",
    contextWindow: 200000,
    maxOutputTokens: 100000,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: false,
    costPerInputToken: 0.00015,
    costPerOutputToken: 0.0006,
    category: "powerful",
  },
  "openai:o1-mini": {
    id: "openai:o1-mini",
    provider: "openai",
    contextWindow: 200000,
    maxOutputTokens: 65536,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: false,
    costPerInputToken: 0.0000011,
    costPerOutputToken: 0.0000044,
    category: "balanced",
  },
  "openai:o3-mini": {
    id: "openai:o3-mini",
    provider: "openai",
    contextWindow: 200000,
    maxOutputTokens: 100000,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.0000011,
    costPerOutputToken: 0.0000044,
    category: "balanced",
  },
  "openai:gpt-4-1": {
    id: "openai:gpt-4-1",
    provider: "openai",
    contextWindow: 1000000,
    maxOutputTokens: 32768,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.000002,
    costPerOutputToken: 0.000008,
    category: "balanced",
  },
  "openai:gpt-4-5": {
    id: "openai:gpt-4-5",
    provider: "openai",
    contextWindow: 128000,
    maxOutputTokens: 16000,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.000075,
    costPerOutputToken: 0.00015,
    category: "balanced",
  },
  "openai:o3": {
    id: "openai:o3",
    provider: "openai",
    contextWindow: 200000,
    maxOutputTokens: 100000,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.00001,
    costPerOutputToken: 0.00004,
    category: "powerful",
  },
  "openai:o4-mini": {
    id: "openai:o4-mini",
    provider: "openai",
    contextWindow: 200000,
    maxOutputTokens: 100000,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.0000011,
    costPerOutputToken: 0.0000044,
    category: "balanced",
  },
  "openai:codex-mini": {
    id: "openai:codex-mini",
    provider: "openai",
    contextWindow: 200000,
    maxOutputTokens: 100000,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.0000015,
    costPerOutputToken: 0.000006,
    category: "balanced",
  },
};
