import { openai as originalOpenAi } from "@ai-sdk/openai";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

const openaiModels = {
  "gpt-4.1": originalOpenAi("gpt-4.1"),
  o3: originalOpenAi.responses("o3"),
  "o4-mini": originalOpenAi.responses("o4-mini"),
  "codex-mini": originalOpenAi("codex-mini-latest"),
  "gpt-5.2": originalOpenAi("gpt-5.2"),
  "gpt-5.1-codex-mini": originalOpenAi("gpt-5.1-codex-mini"),
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
  },
  "openai:gpt-5.2": {
    id: "openai:gpt-5.2",
    provider: "openai",
    contextWindow: 400000,
    maxOutputTokens: 128000,
    defaultTemperature: 1.0,
    promptFormat: "xml",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.00000175,
    costPerOutputToken: 0.000014,
  },
  "openai:gpt-5.1-codex-mini": {
    id: "openai:gpt-5.1-codex-mini",
    provider: "openai",
    contextWindow: 400000,
    maxOutputTokens: 100000,
    defaultTemperature: -1,
    promptFormat: "xml",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.00000025,
    costPerOutputToken: 0.000002,
  },
};
