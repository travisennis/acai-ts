import { isString } from "@travisennis/stdlib/typeguards";
import { createProviderRegistry } from "ai";
import {
  anthropicModelNames,
  anthropicModelRegistry,
  anthropicProvider,
} from "./anthropic-provider.ts";
import {
  deepseekModelNames,
  deepseekModelRegistry,
  deepseekProvider,
} from "./deepseek-provider.ts";
import {
  googleModelNames,
  googleModelRegistry,
  googleProvider,
} from "./google-provider.ts";
import {
  groqModelNames,
  groqModelRegistry,
  groqProvider,
} from "./groq-provider.ts";
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

const providers = [
  "anthropic",
  "openai",
  "google",
  "groq",
  "deepseek",
  "openrouter",
  "xai",
] as const;

type ModelProvider = (typeof providers)[number];

const registry = createProviderRegistry({
  ...anthropicProvider,
  ...deepseekProvider,
  ...googleProvider,
  ...groqProvider,
  ...openaiProvider,
  ...openrouterProvider,
  ...xaiProvider,
});

export const models = [
  ...anthropicModelNames,
  ...openaiModelNames,
  ...googleModelNames,
  ...groqModelNames,
  ...deepseekModelNames,
  ...openrouterModelNames,
  ...xaiModelNames,
] as const;

export type ModelName =
  | (typeof models)[number]
  | (`xai:${string}` & {})
  | (`openai:${string}` & {})
  | (`anthropic:${string}` & {})
  | (`google:${string}` & {})
  | (`groq:${string}` & {})
  | (`deepseek:${string}` & {})
  | (`openrouter:${string}` & {});

export function isSupportedModel(model: unknown): model is ModelName {
  return (
    models.includes(model as (typeof models)[number]) ||
    (isString(model) &&
      (model.startsWith("openrouter:") ||
        model.startsWith("anthropic:") ||
        model.startsWith("openai:") ||
        model.startsWith("google:") ||
        model.startsWith("groq:") ||
        model.startsWith("xai:") ||
        model.startsWith("deepseek:")))
  );
}

export function languageModel(model: ModelName) {
  return registry.languageModel(model as (typeof models)[number]);
}

export interface ModelMetadata<T = ModelName> {
  id: T;
  provider: ModelProvider;
  contextWindow: number;
  supportsToolCalling: boolean;
  supportsReasoning: boolean;
  costPerInputToken: number;
  costPerOutputToken: number;
  maxOutputTokens: number;
  defaultTemperature: number;
  promptFormat: "xml" | "markdown" | "bracket";
}

// https://openrouter.ai/api/v1/models
export const modelRegistry: Record<ModelName, ModelMetadata> = {
  ...anthropicModelRegistry,
  ...openaiModelRegistry,
  ...googleModelRegistry,
  ...groqModelRegistry,
  ...deepseekModelRegistry,
  ...openrouterModelRegistry,
  ...xaiModelRegistry,
};

// Check if a model name is valid
export function isValidModel(modelName: string): modelName is ModelName {
  return modelName in modelRegistry;
}
