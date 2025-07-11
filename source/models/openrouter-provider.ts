import { createOpenAI } from "@ai-sdk/openai";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

const openRouterClient = createOpenAI({
  // biome-ignore lint/style/useNamingConvention: third-party controlled
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env["OPENROUTER_API_KEY"] ?? "",
  headers: {
    // biome-ignore lint/style/useNamingConvention: api header name
    HTTP_Referer: "https://github.com/travisennis/acai-ts",
    "X-Title": "acai",
  },
});

const openrouterModels = {
  "deepseek-v3": openRouterClient("deepseek/deepseek-chat-v3-0324:free"),
  "deepseek-r1": openRouterClient("deepseek/deepseek-r1-0528:free"),
  "gemini-flash25": openRouterClient("google/gemini-2.5-flash"),
  "gemini-pro25": openRouterClient("google/gemini-2.5-pro"),
  sonnet4: openRouterClient("anthropic/claude-sonnet-4"),
  opus4: openRouterClient("anthropic/claude-opus-4"),
  "gpt-4.1": openRouterClient("openai/gpt-4.1"),
} as const;

type ModelName = `openrouter:${keyof typeof openrouterModels}`;

export const openrouterModelNames: ModelName[] = objectKeys(
  openrouterModels,
).map((key) => `openrouter:${key}` as const);

export const openrouterProvider = {
  openrouter: customProvider({
    languageModels: openrouterModels,
    fallbackProvider: openRouterClient,
  }),
};

export const openrouterModelRegistry: {
  [K in ModelName]: ModelMetadata<ModelName>;
} = {
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
    maxOutputTokens: 32768,
    defaultTemperature: 0.6,
    promptFormat: "bracket",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0, // Assuming free tier or unknown cost
    costPerOutputToken: 0, // Assuming free tier or unknown cost
    category: "balanced",
  },
  "openrouter:gemini-flash25": {
    id: "openrouter:gemini-flash25",
    provider: "openrouter",
    contextWindow: 1000000,
    maxOutputTokens: 66000,
    defaultTemperature: 0.5,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "fast",
  },
  "openrouter:gemini-pro25": {
    id: "openrouter:gemini-pro25",
    provider: "openrouter",
    contextWindow: 1000000,
    maxOutputTokens: 64000,
    defaultTemperature: 0.5,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "powerful",
  },
  "openrouter:opus4": {
    id: "openrouter:opus4",
    provider: "openrouter",
    contextWindow: 200000,
    maxOutputTokens: 64000,
    defaultTemperature: 0.5,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "powerful",
  },
  "openrouter:sonnet4": {
    id: "openrouter:sonnet4",
    provider: "openrouter",
    contextWindow: 200000,
    maxOutputTokens: 64000,
    defaultTemperature: 0.5,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "balanced",
  },
  "openrouter:gpt-4.1": {
    id: "openrouter:gpt-4.1",
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
};
