import { openai as originalOpenAi } from "@ai-sdk/openai";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

const openaiModels = {
  "gpt-5.2": originalOpenAi("gpt-5.2"),
  "gpt-5.2-codex": originalOpenAi.responses("gpt-5.2-codex"),
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
  "openai:gpt-5.2-codex": {
    id: "openai:gpt-5.2-codex",
    provider: "openai",
    contextWindow: 400000,
    maxOutputTokens: 128000,
    defaultTemperature: -1,
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
