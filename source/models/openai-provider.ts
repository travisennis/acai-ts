import { openai as originalOpenAi } from "@ai-sdk/openai";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

const openaiModels = {
  "gpt-4.1": originalOpenAi("gpt-4.1"),
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
  "openai:gpt-4.1": {
    id: "openai:gpt-4.1",
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
