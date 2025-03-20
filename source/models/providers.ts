import {
  createAnthropic,
  anthropic as originalAnthropic,
} from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { deepseek as originalDeepseek } from "@ai-sdk/deepseek";
import { google as originalGoogle } from "@ai-sdk/google";
import { createOpenAI, openai as originalOpenAi } from "@ai-sdk/openai";
import {
  experimental_createProviderRegistry as createProviderRegistry,
  customProvider,
} from "ai";
import { createOllama } from "ollama-ai-provider";
import { z } from "zod";

export type ModelProvider =
  | "anthropic"
  | "openai"
  | "google"
  | "deepseek"
  | "azure"
  | "openrouter"
  | "ollama";

const azure = customProvider({
  languageModels: {
    text: createAzure({
      resourceName: process.env["AZURE_RESOURCE_NAME"] ?? "",
      apiKey: process.env["AZURE_API_KEY"] ?? "",
    })(process.env["AZURE_DEPLOYMENT_NAME"] ?? ""),
  },
});

const openRouterClient = createOpenAI({
  // biome-ignore lint/style/useNamingConvention: <explanation>
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env["OPENROUTER_API_KEY"] ?? "",
});

const openrouter = customProvider({
  languageModels: {
    "deepseek-v3": openRouterClient("deepseek/deepseek-chat"),
    "deepseek-r1": openRouterClient("deepseek/deepseek-r1"),
  },
  fallbackProvider: openRouterClient,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addCacheControlToTools(body: string) {
  const parsedBody = JSON.parse(body);
  if (isRecord(parsedBody)) {
    const tools = parsedBody["tools"];
    if (Array.isArray(tools)) {
      tools.at(-1).cache_control = { type: "ephemeral" };
    }
  }
  return JSON.stringify(parsedBody);
}

const anthropic = customProvider({
  languageModels: {
    sonnet: createAnthropic({
      fetch(input, init) {
        const body = init?.body;
        if (body && typeof body === "string") {
          init.body = addCacheControlToTools(body);
        }
        return fetch(input, init);
      },
    })("claude-3-7-sonnet-20250219"),
    "sonnet-token-efficient-tools": createAnthropic({
      headers: {
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "token-efficient-tools-2025-02-19",
      },
      fetch(input, init) {
        const body = init?.body;
        if (body && typeof body === "string") {
          init.body = addCacheControlToTools(body);
        }
        return fetch(input, init);
      },
    })("claude-3-7-sonnet-20250219"),
    "sonnet-128k": createAnthropic({
      headers: {
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "output-128k-2025-02-19",
      },
      fetch(input, init) {
        const body = init?.body;
        if (body && typeof body === "string") {
          init.body = addCacheControlToTools(body);
        }
        return fetch(input, init);
      },
    })("claude-3-7-sonnet-20250219"),
    sonnet35: createAnthropic({
      headers: {
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "max-tokens-3-5-sonnet-2024-07-15",
      },
      fetch(input, init) {
        const body = init?.body;
        if (body && typeof body === "string") {
          init.body = addCacheControlToTools(body);
        }
        return fetch(input, init);
      },
    })("claude-3-5-sonnet-20241022"),
    haiku: originalAnthropic("claude-3-5-haiku-20241022"),
  },
  fallbackProvider: originalAnthropic,
});

const openai = customProvider({
  languageModels: {
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
  },
  fallbackProvider: originalOpenAi,
});

const google = customProvider({
  languageModels: {
    flash2: originalGoogle("gemini-2.0-flash"),
    "flash2-search": originalGoogle("gemini-2.0-flash", {
      useSearchGrounding: true,
    }),
    flash2lite: originalGoogle("gemini-2.0-flash-lite-preview-02-05"),
    flash2thinking: originalGoogle("gemini-2.0-flash-thinking-exp-01-21"),
    pro2: originalGoogle("gemini-2.0-pro-exp-02-05"),
  },
  fallbackProvider: originalGoogle,
});

const deepseek = customProvider({
  languageModels: {
    "deepseek-chat": originalDeepseek("deepseek-chat"),
    "deepseek-reasoner": originalDeepseek("deepseek-reasoner"),
  },
  fallbackProvider: originalDeepseek,
});

const ollama = customProvider({
  fallbackProvider: createOllama(),
});

const registry = createProviderRegistry({
  anthropic,
  azure,
  deepseek,
  google,
  openai,
  openrouter,
  ollama,
});

export const models = [
  "anthropic:sonnet",
  "anthropic:sonnet-token-efficient-tools",
  "anthropic:sonnet-128k",
  "anthropic:sonnet35",
  "anthropic:haiku",
  "openai:chatgpt-4o-latest",
  "openai:gpt-4o",
  "openai:gpt-4o-mini",
  "openai:gpt-4o-structured",
  "openai:gpt-4o-mini-structured",
  "openai:o1",
  "openai:o1-pro",
  "openai:o1-mini",
  "openai:o3-mini",
  "google:flash2",
  "google:flash2lite",
  "google:flash2-search",
  "google:flash2thinking",
  "google:pro2",
  "deepseek:deepseek-chat",
  "deepseek:deepseek-reasoner",
  "openrouter:deepseek-v3",
  "openrouter:deepseek-r1",
] as const;

export type ModelName = (typeof models)[number];

export function isSupportedModel(model: unknown): model is ModelName {
  return (
    models.includes(model as ModelName) ||
    (isString(model) &&
      (model.startsWith("openrouter:") ||
        model.startsWith("ollama:") ||
        model.startsWith("anthropic:") ||
        model.startsWith("openai:") ||
        model.startsWith("google:") ||
        model.startsWith("deepseek:")))
  );
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function languageModel(input: ModelName) {
  return registry.languageModel(input);
}

export interface ModelMetadata {
  id: ModelName;
  provider: ModelProvider;
  // displayName: string;
  // description: string;
  contextWindow: number;
  supportsToolCalling: boolean;
  supportsReasoning: boolean;
  costPerInputToken: number;
  costPerOutputToken: number;
  maxOutputTokens: number;
  defaultTemperature: number;
  promptFormat: "xml" | "markdown" | "bracket";
  category: "fast" | "balanced" | "powerful";
}

// https://openrouter.ai/api/v1/models
export const modelRegistry: Record<ModelName, ModelMetadata> = {
  "anthropic:sonnet": {
    id: "anthropic:sonnet",
    provider: "anthropic",
    contextWindow: 0,
    maxOutputTokens: 64_000,
    defaultTemperature: 0.3,
    promptFormat: "xml",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    category: "balanced",
  },
  "anthropic:sonnet-token-efficient-tools": {
    id: "anthropic:sonnet-token-efficient-tools",
    provider: "anthropic",
    contextWindow: 0,
    maxOutputTokens: 64_000,
    defaultTemperature: 0.3,
    promptFormat: "xml",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    category: "balanced",
  },
  "anthropic:sonnet-128k": {
    id: "anthropic:sonnet-128k",
    provider: "anthropic",
    contextWindow: 0,
    maxOutputTokens: 128_000,
    defaultTemperature: 0.3,
    promptFormat: "xml",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    category: "powerful",
  },
  "anthropic:sonnet35": {
    id: "anthropic:sonnet35",
    provider: "anthropic",
    contextWindow: 0,
    maxOutputTokens: 8_096,
    defaultTemperature: 0.3,
    promptFormat: "xml",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    category: "balanced",
  },
  "anthropic:haiku": {
    id: "anthropic:haiku",
    provider: "anthropic",
    contextWindow: 0,
    maxOutputTokens: 4_096,
    defaultTemperature: 0.3,
    promptFormat: "xml",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.0000008,
    costPerOutputToken: 0.000004,
    category: "fast",
  },
  "openai:chatgpt-4o-latest": {
    id: "openai:chatgpt-4o-latest",
    provider: "openai",
    contextWindow: 0,
    maxOutputTokens: 16_384,
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
    contextWindow: 0,
    maxOutputTokens: 16_384,
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
    contextWindow: 0,
    maxOutputTokens: 16_384,
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
    contextWindow: 0,
    maxOutputTokens: 16_384,
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
    contextWindow: 0,
    maxOutputTokens: 16_384,
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
    contextWindow: 0,
    maxOutputTokens: 100_000,
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
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
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
    contextWindow: 0,
    maxOutputTokens: 65_536,
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
    contextWindow: 0,
    maxOutputTokens: 100_000,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.0000011,
    costPerOutputToken: 0.0000044,
    category: "balanced",
  },
  "google:flash2": {
    id: "google:flash2",
    provider: "openai",
    contextWindow: 0,
    maxOutputTokens: 8_192,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "balanced",
  },
  "google:flash2lite": {
    id: "google:flash2lite",
    provider: "openai",
    contextWindow: 0,
    maxOutputTokens: 8_192,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "fast",
  },
  "google:flash2-search": {
    id: "google:flash2-search",
    provider: "openai",
    contextWindow: 0,
    maxOutputTokens: 8_192,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "balanced",
  },
  "google:flash2thinking": {
    id: "google:flash2thinking",
    provider: "openai",
    contextWindow: 0,
    maxOutputTokens: 8_192,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "balanced",
  },
  "google:pro2": {
    id: "google:pro2",
    provider: "openai",
    contextWindow: 0,
    maxOutputTokens: 8_192,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "balanced",
  },
  "deepseek:deepseek-chat": {
    id: "deepseek:deepseek-chat",
    provider: "openai",
    contextWindow: 0,
    maxOutputTokens: 8_000,
    defaultTemperature: 0.3,
    promptFormat: "bracket",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.0000012,
    costPerOutputToken: 0.0000012,
    category: "balanced",
  },
  "deepseek:deepseek-reasoner": {
    id: "deepseek:deepseek-reasoner",
    provider: "openai",
    contextWindow: 0,
    maxOutputTokens: 8_000,
    defaultTemperature: 0.6,
    promptFormat: "bracket",
    supportsReasoning: true,
    supportsToolCalling: false,
    costPerInputToken: 0.00000055,
    costPerOutputToken: 0.00000219,
    category: "balanced",
  },
  "openrouter:deepseek-v3": {
    id: "openrouter:deepseek-v3",
    provider: "openai",
    contextWindow: 0,
    maxOutputTokens: 8_000,
    defaultTemperature: 0.3,
    promptFormat: "bracket",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "balanced",
  },
  "openrouter:deepseek-r1": {
    id: "openrouter:deepseek-r1",
    provider: "openai",
    contextWindow: 0,
    maxOutputTokens: 8_000,
    defaultTemperature: 0.6,
    promptFormat: "bracket",
    supportsReasoning: true,
    supportsToolCalling: false,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "balanced",
  },
};

// Schema for validating model selection
export const ModelSelectionSchema = z.enum(
  Object.keys(modelRegistry) as [string, ...string[]],
);

// Get available models grouped by provider
export function getModelsByProvider(): Record<ModelProvider, ModelMetadata[]> {
  const result: Record<ModelProvider, ModelMetadata[]> = {
    anthropic: [],
    openai: [],
    google: [],
    deepseek: [],
    azure: [],
    openrouter: [],
    ollama: [],
  };

  for (const model of Object.values(modelRegistry)) {
    result[model.provider].push(model);
  }

  return result;
}

// Get detailed information about a specific model
export function getModelInfo(modelName: ModelName): ModelMetadata | undefined {
  return modelRegistry[modelName];
}

// Check if a model name is valid
export function isValidModel(modelName: string): modelName is ModelName {
  return modelName in modelRegistry;
}

// Get recommended models based on task requirements
export function getRecommendedModels(options: {
  requiresTools?: boolean;
  requiresReasoning?: boolean;
  speedPriority?: boolean;
}): ModelName[] {
  return Object.values(modelRegistry)
    .filter((model) => {
      if (options.requiresTools && !model.supportsToolCalling) {
        return false;
      }
      if (options.requiresReasoning && !model.supportsReasoning) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (options.speedPriority) {
        return a.category === "fast" ? -1 : 1;
      }
      return b.contextWindow - a.contextWindow;
    })
    .map((model) => model.id);
}
