import { deepseek as originalDeepseek } from "@ai-sdk/deepseek";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

const deepseekModels = {
  "deepseek-chat": originalDeepseek("deepseek-chat"),
  "deepseek-reasoner": originalDeepseek("deepseek-reasoner"),
  "deepseek-v4-flash": originalDeepseek("deepseek-v4-flash"),
  "deepseek-v4-pro": originalDeepseek("deepseek-v4-pro"),
} as const;

type ModelName = `deepseek:${keyof typeof deepseekModels}`;

export const deepseekModelNames: ModelName[] = objectKeys(deepseekModels).map(
  (key) => `deepseek:${key}` as const,
);

export const deepseekProvider = {
  deepseek: customProvider({
    languageModels: deepseekModels,
    fallbackProvider: originalDeepseek,
  }),
};

export const deepseekModelRegistry: {
  [K in ModelName]: ModelMetadata<ModelName>;
} = {
  "deepseek:deepseek-chat": {
    id: "deepseek:deepseek-chat",
    provider: "deepseek",
    contextWindow: 1000000,
    maxOutputTokens: 384000,
    defaultTemperature: 0.3,
    promptFormat: "bracket",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.00000014,
    costPerOutputToken: 0.00000028,
  },
  "deepseek:deepseek-reasoner": {
    id: "deepseek:deepseek-reasoner",
    provider: "deepseek",
    contextWindow: 1000000,
    maxOutputTokens: 384000,
    defaultTemperature: 0.6,
    promptFormat: "bracket",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.00000014,
    costPerOutputToken: 0.00000028,
  },
  "deepseek:deepseek-v4-flash": {
    id: "deepseek:deepseek-v4-flash",
    provider: "deepseek",
    contextWindow: 1000000,
    maxOutputTokens: 384000,
    defaultTemperature: 0.3,
    promptFormat: "bracket",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.00000014,
    costPerOutputToken: 0.00000028,
  },
  "deepseek:deepseek-v4-pro": {
    id: "deepseek:deepseek-v4-pro",
    provider: "deepseek",
    contextWindow: 1000000,
    maxOutputTokens: 384000,
    defaultTemperature: 0.3,
    promptFormat: "bracket",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.000000435,
    costPerOutputToken: 0.00000087,
  },
};
