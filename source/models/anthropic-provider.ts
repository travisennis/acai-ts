import {
  createAnthropic,
  anthropic as originalAnthropic,
} from "@ai-sdk/anthropic";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

const anthropicModels = {
  opus: createAnthropic()("claude-opus-4-5"),
  sonnet: createAnthropic()("claude-sonnet-4-5"),
  haiku: originalAnthropic("claude-haiku-4-5"),
} as const;

type ModelName = `anthropic:${keyof typeof anthropicModels}`;

export const anthropicModelNames: ModelName[] = objectKeys(anthropicModels).map(
  (key) => `anthropic:${key}` as const,
);

export const anthropicProvider = {
  anthropic: customProvider({
    languageModels: anthropicModels,
    fallbackProvider: originalAnthropic,
  }),
};

export const anthropicModelRegistry: {
  [K in ModelName]: ModelMetadata<ModelName>;
} = {
  "anthropic:opus": {
    id: "anthropic:opus",
    provider: "anthropic",
    contextWindow: 200000,
    maxOutputTokens: 64000,
    defaultTemperature: 0.3,
    promptFormat: "xml",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.000015,
    costPerOutputToken: 0.000075,
  },
  "anthropic:sonnet": {
    id: "anthropic:sonnet",
    provider: "anthropic",
    contextWindow: 200000,
    maxOutputTokens: 64000,
    defaultTemperature: 0.3,
    promptFormat: "xml",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
  },
  "anthropic:haiku": {
    id: "anthropic:haiku",
    provider: "anthropic",
    contextWindow: 200000,
    maxOutputTokens: 4096,
    defaultTemperature: 0.3,
    promptFormat: "xml",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.0000008,
    costPerOutputToken: 0.000004,
  },
};
