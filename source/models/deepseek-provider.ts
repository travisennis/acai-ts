import { deepseek as originalDeepseek } from "@ai-sdk/deepseek";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

export const deepseekProvider = {
  deepseek: customProvider({
    languageModels: {
      "deepseek-chat": originalDeepseek("deepseek-chat"),
      "deepseek-reasoner": originalDeepseek("deepseek-reasoner"),
    },
    fallbackProvider: originalDeepseek,
  }),
};

export const deepseekModelNames = [
  "deepseek:deepseek-chat",
  "deepseek:deepseek-reasoner",
] as const;

export type DeepseekModelName = (typeof deepseekModelNames)[number];

export const deepseekModelRegistry: Record<
  DeepseekModelName,
  ModelMetadata<DeepseekModelName>
> = {
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
    supportsToolCalling: false, // Check if this model supports tools
    costPerInputToken: 0.00000055, // Check official pricing
    costPerOutputToken: 0.00000219, // Check official pricing
    category: "balanced",
  },
};
