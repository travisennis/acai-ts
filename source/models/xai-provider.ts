import { createOpenAI } from "@ai-sdk/openai";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

const xaiClient = createOpenAI({
  apiKey: process.env["X_AI_API_KEY"] ?? process.env["XAI_API_KEY"],
  // biome-ignore lint/style/useNamingConvention: <explanation>
  baseURL: "https://api.x.ai/v1",
});

const xaiModels = {
  grok3: xaiClient("grok-3"),
  "grok3-mini": xaiClient("grok-3-mini-beta"),
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
  "xai:grok3": {
    id: "xai:grok3",
    provider: "xai",
    contextWindow: 131072,
    maxOutputTokens: 131072, // Note: API docs might specify lower practical limits
    defaultTemperature: 0.6,
    promptFormat: "markdown",
    supportsReasoning: false, // Assuming based on typical chat models
    supportsToolCalling: true,
    costPerInputToken: 0.000003, // Placeholder, check official pricing
    costPerOutputToken: 0.000015, // Placeholder, check official pricing
    category: "balanced",
  },
  "xai:grok3-mini": {
    id: "xai:grok3-mini",
    provider: "xai",
    contextWindow: 131072,
    maxOutputTokens: 131072, // Note: API docs might specify lower practical limits
    defaultTemperature: 0.6,
    promptFormat: "markdown",
    supportsReasoning: true, // Assuming based on typical chat models
    supportsToolCalling: true,
    costPerInputToken: 0.0000003, // Placeholder, check official pricing
    costPerOutputToken: 0.0000005, // Placeholder, check official pricing
    category: "fast", // Or "fast" depending on performance
  },
};
