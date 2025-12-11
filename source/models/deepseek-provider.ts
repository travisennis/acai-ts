import { deepseek as originalDeepseek } from "@ai-sdk/deepseek";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

const deepseekModels = {
  "deepseek-chat": originalDeepseek("deepseek-chat"),
  "deepseek-reasoner": originalDeepseek("deepseek-reasoner"),
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
    contextWindow: 128000,
    maxOutputTokens: 8000,
    defaultTemperature: 0.3,
    promptFormat: "bracket",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.0000012, // Check official pricing
    costPerOutputToken: 0.0000012, // Check official pricing
  },
  "deepseek:deepseek-reasoner": {
    id: "deepseek:deepseek-reasoner",
    provider: "deepseek",
    contextWindow: 128000,
    maxOutputTokens: 32768,
    defaultTemperature: 0.6,
    promptFormat: "bracket",
    supportsReasoning: true,
    supportsToolCalling: true, // Check if this model supports tools
    costPerInputToken: 0.00000055, // Check official pricing
    costPerOutputToken: 0.00000219, // Check official pricing
  },
};
