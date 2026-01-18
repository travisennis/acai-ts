import { createOpenAI } from "@ai-sdk/openai";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

const xaiClient = createOpenAI({
  apiKey: process.env["X_AI_API_KEY"] ?? process.env["XAI_API_KEY"],
  // biome-ignore lint/style/useNamingConvention: third-party controlled
  baseURL: "https://api.x.ai/v1",
});

const xaiModels = {
  "grok-4-1-fast": xaiClient("grok-4.1-fast"),
  "grok-code-fast-1": xaiClient("grok-code-fast-1"),
} as const;

type ModelName = `xai:${keyof typeof xaiModels}`;

export const xaiModelNames: ModelName[] = objectKeys(xaiModels).map(
  (key) => `xai:${key}` as const,
);

export const xaiProvider = {
  xai: customProvider({
    languageModels: xaiModels,
    fallbackProvider: xaiClient,
  }),
};

export const xaiModelRegistry: {
  [K in ModelName]: ModelMetadata<ModelName>;
} = {
  "xai:grok-4-1-fast": {
    id: "xai:grok-4-1-fast",
    provider: "xai",
    contextWindow: 2000000,
    maxOutputTokens: 30000,
    defaultTemperature: 0.5,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.0000002,
    costPerOutputToken: 0.0000005,
  },
  "xai:grok-code-fast-1": {
    id: "xai:grok-code-fast-1",
    provider: "xai",
    contextWindow: 256000,
    maxOutputTokens: 10000,
    defaultTemperature: -1,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.0000002,
    costPerOutputToken: 0.0000015,
  },
};
