// import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

const completionsClient = createOpenAICompatible({
  name: "opencode",
  apiKey: process.env["OPENCODE_ZEN_API_TOKEN"] ?? "",
  // biome-ignore lint/style/useNamingConvention: third-party controlled
  baseURL: "https://opencode.ai/zen/v1", ///chat/completions",
});

const messagesClient = createAnthropic({
  // biome-ignore lint/style/useNamingConvention: third-party controlled
  baseURL: "https://opencode.ai/zen/v1", // /messages",
  apiKey: process.env["OPENCODE_ZEN_API_TOKEN"] ?? "",
});

// const openRouterClient = createOpenAI({
//   // biome-ignore lint/style/useNamingConvention: third-party controlled
//   baseURL: "https://openrouter.ai/api/v1",
//   name: "openrouter",
//   apiKey: process.env["OPENROUTER_API_KEY"] ?? "",
//   headers: {
//     "HTTP-Referer": "https://github.com/travisennis/acai-ts",
//     "X-Title": "acai",
//   },
// });

const opencodeZenModels = {
  "glm-4-7": completionsClient("glm-4.7-free"),
  "minimax-m2-1": messagesClient("minimax-m2.1-free"),
  "opus-4-5": messagesClient("claude-opus-4.5"),
} as const;

type ModelName = `opencode:${keyof typeof opencodeZenModels}`;

export const opencodeZenModelNames: ModelName[] = objectKeys(
  opencodeZenModels,
).map((key) => `opencode:${key}` as const);

export const opencodeZenProvider = {
  opencode: customProvider({
    languageModels: opencodeZenModels,
    fallbackProvider: completionsClient,
  }),
};

export const opencodeZenModelRegistry: {
  [K in ModelName]: ModelMetadata<ModelName>;
} = {
  "opencode:glm-4-7": {
    id: "opencode:glm-4-7",
    provider: "opencode",
    contextWindow: 200000,
    maxOutputTokens: 131072,
    defaultTemperature: 0.5,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 1.1e-7,
    costPerOutputToken: 0.0000022,
  },
  "opencode:minimax-m2-1": {
    id: "opencode:minimax-m2-1",
    provider: "opencode",
    contextWindow: 204800,
    maxOutputTokens: 131072,
    defaultTemperature: 0.5,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 3e-7,
    costPerOutputToken: 0.0000012,
  },
  "opencode:opus-4-5": {
    id: "opencode:opus-4-5",
    provider: "opencode",
    contextWindow: 200000,
    maxOutputTokens: 32000,
    defaultTemperature: 1.0,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.000005,
    costPerOutputToken: 0.000025,
  },
};
