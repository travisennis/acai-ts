import { createAzure } from "@ai-sdk/azure";
import { deepseek as originalDeepseek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import { createProviderRegistry, customProvider } from "ai";
import { createOllama } from "ollama-ai-provider";
import { z } from "zod";
import {
  anthropicModelNames,
  anthropicModelRegistry,
  anthropicProvider,
} from "./anthropic-provider.ts";
import {
  openaiModelNames,
  openaiModelRegistry,
  openaiProvider,
} from "./openai-provider.ts";
import {
  googleModelNames,
  googleModelRegistry,
  googleProvider,
} from "./google-provider.ts";

export const providers = [
  "anthropic",
  "openai",
  "google",
  "deepseek",
  "azure",
  "openrouter",
  "ollama",
  "xai",
] as const;

export type ModelProvider = (typeof providers)[number];

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
    // "quasar-alpha": openRouterClient("openrouter/quasar-alpha"),
    "optimus-alpha": openRouterClient("openrouter/optimus-alpha"),
  },
  fallbackProvider: openRouterClient,
});

const deepseek = customProvider({
  languageModels: {
    "deepseek-chat": originalDeepseek("deepseek-chat"),
    "deepseek-reasoner": originalDeepseek("deepseek-reasoner"),
  },
  fallbackProvider: originalDeepseek,
});

const xaiClient = createOpenAI({
  apiKey: process.env["X_AI_API_KEY"] ?? process.env["XAI_API_KEY"],
  // biome-ignore lint/style/useNamingConvention: <explanation>
  baseURL: "https://api.x.ai/v1",
});

const xai = customProvider({
  languageModels: {
    grok3: xaiClient("grok-3"),
    "grok3-mini": xaiClient("grok-3-mini-beta"),
  },
  fallbackProvider: xaiClient,
});

const ollama = customProvider({
  fallbackProvider: createOllama(),
});

const registry = createProviderRegistry({
  ...anthropicProvider,
  azure,
  deepseek,
  ...googleProvider,
  ...openaiProvider,
  openrouter,
  ollama,
  xai,
});

export const models = [
  ...anthropicModelNames,
  ...openaiModelNames,
  ...googleModelNames,
  "deepseek:deepseek-chat",
  "deepseek:deepseek-reasoner",
  "openrouter:deepseek-v3",
  "openrouter:deepseek-r1",
  // "openrouter:quasar-alpha",
  "xai:grok3",
  "xai:grok3-mini",
  "openrouter:optimus-alpha",
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

export interface ModelMetadata<T = ModelName> {
  id: T;
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
  ...anthropicModelRegistry,
  ...openaiModelRegistry,
  ...googleModelRegistry,
  "deepseek:deepseek-chat": {
    id: "deepseek:deepseek-chat",
    provider: "deepseek",
    contextWindow: 128000,
    maxOutputTokens: 8000,
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
    provider: "deepseek",
    contextWindow: 128000,
    maxOutputTokens: 8000,
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
    provider: "openrouter",
    contextWindow: 128000,
    maxOutputTokens: 8000,
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
    provider: "openrouter",
    contextWindow: 128000,
    maxOutputTokens: 8000,
    defaultTemperature: 0.6,
    promptFormat: "bracket",
    supportsReasoning: true,
    supportsToolCalling: false,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "balanced",
  },
  // "openrouter:quasar-alpha": {
  //   id: "openrouter:quasar-alpha",
  //   provider: "openrouter",
  //   contextWindow: 1000000,
  //   maxOutputTokens: 32000,
  //   defaultTemperature: 0.3,
  //   promptFormat: "markdown",
  //   supportsReasoning: false,
  //   supportsToolCalling: true,
  //   costPerInputToken: 0,
  //   costPerOutputToken: 0,
  //   category: "balanced",
  // },
  "openrouter:optimus-alpha": {
    id: "openrouter:optimus-alpha",
    provider: "openrouter",
    contextWindow: 1000000,
    maxOutputTokens: 32000,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "balanced",
  },
  "xai:grok3": {
    id: "xai:grok3",
    provider: "xai",
    contextWindow: 131072,
    maxOutputTokens: 131072,
    defaultTemperature: 0.6,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    category: "balanced",
  },
  "xai:grok3-mini": {
    id: "xai:grok3-mini",
    provider: "xai",
    contextWindow: 131072,
    maxOutputTokens: 131072,
    defaultTemperature: 0.6,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.0000003,
    costPerOutputToken: 0.0000005,
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
    xai: [],
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

// Get models by category
export function getModelsByCategory(
  category: "fast" | "balanced" | "powerful",
): ModelMetadata[] {
  return Object.values(modelRegistry).filter(
    (model) => model.category === category,
  );
}

// Format model information for display
export function formatModelInfo(model: ModelMetadata): string {
  return `${model.id} [${model.category}] - Tools: ${model.supportsToolCalling ? "✓" : "✗"}, Reasoning: ${model.supportsReasoning ? "✓" : "✗"}`;
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
