import { createProviderRegistry } from "ai";
import { z } from "zod";
import {
  anthropicModelNames,
  anthropicModelRegistry,
  anthropicProvider,
} from "./anthropic-provider.ts";
import {
  googleModelNames,
  googleModelRegistry,
  googleProvider,
} from "./google-provider.ts";
import {
  deepseekModelNames,
  deepseekModelRegistry,
  deepseekProvider,
} from "./deepseek-provider.ts";
import {
  openaiModelNames,
  openaiModelRegistry,
  openaiProvider,
} from "./openai-provider.ts";
import {
  openrouterModelNames,
  openrouterModelRegistry,
  openrouterProvider,
} from "./openrouter-provider.ts";
import {
  xaiModelNames,
  xaiModelRegistry,
  xaiProvider,
} from "./xai-provider.ts";

export const providers = [
  "anthropic",
  "openai",
  "google",
  "deepseek",
  "openrouter",
  "xai",
] as const;

export type ModelProvider = (typeof providers)[number];

const registry = createProviderRegistry({
  ...anthropicProvider,
  ...deepseekProvider,
  ...googleProvider,
  ...openaiProvider,
  ...openrouterProvider,
  ...xaiProvider,
});

export const models = [
  ...anthropicModelNames,
  ...openaiModelNames,
  ...googleModelNames,
  ...deepseekModelNames,
  ...openrouterModelNames,
  ...xaiModelNames,
] as const;

export type ModelName = (typeof models)[number];

export function isSupportedModel(model: unknown): model is ModelName {
  return (
    models.includes(model as ModelName) ||
    (isString(model) &&
      (model.startsWith("openrouter:") ||
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
  ...deepseekModelRegistry,
  ...openrouterModelRegistry,
  ...xaiModelRegistry,
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
    openrouter: [],
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
