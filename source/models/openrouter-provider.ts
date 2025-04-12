import { createOpenAI } from "@ai-sdk/openai";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

const openRouterClient = createOpenAI({
  // biome-ignore lint/style/useNamingConvention: <explanation>
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env["OPENROUTER_API_KEY"] ?? "",
});

export const openrouterProvider = {
  openrouter: customProvider({
    languageModels: {
      "deepseek-v3": openRouterClient("deepseek/deepseek-chat"),
      "deepseek-r1": openRouterClient("deepseek/deepseek-r1"),
      "optimus-alpha": openRouterClient("openrouter/optimus-alpha"),
    },
    fallbackProvider: openRouterClient,
  }),
};

export const openrouterModelNames = [
  "openrouter:deepseek-v3",
  "openrouter:deepseek-r1",
  "openrouter:optimus-alpha",
] as const;

export type OpenRouterModelName = (typeof openrouterModelNames)[number];

export const openrouterModelRegistry: Record<
  OpenRouterModelName,
  ModelMetadata<OpenRouterModelName>
> = {
  "openrouter:deepseek-v3": {
    id: "openrouter:deepseek-v3",
    provider: "openrouter",
    contextWindow: 128000,
    maxOutputTokens: 8000,
    defaultTemperature: 0.3,
    promptFormat: "bracket",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0, // Assuming free tier or unknown cost
    costPerOutputToken: 0, // Assuming free tier or unknown cost
    category: "balanced",
  },
  "openrouter:deepseek-r1": {
    id: "openrouter:deepseek-r1",
    provider: "openrouter",
    contextWindow: 128000,
    maxOutputTokens: 8000,
    defaultTemperature: 0.6,
    promptFormat: "bracket",
    supportsReasoning: true,
    supportsToolCalling: false,
    costPerInputToken: 0, // Assuming free tier or unknown cost
    costPerOutputToken: 0, // Assuming free tier or unknown cost
    category: "balanced",
  },
  "openrouter:optimus-alpha": {
    id: "openrouter:optimus-alpha",
    provider: "openrouter",
    contextWindow: 1000000,
    maxOutputTokens: 32000,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0, // Assuming free tier or unknown cost
    costPerOutputToken: 0, // Assuming free tier or unknown cost
    category: "balanced",
  },
};
