import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
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

const responsesClient = createOpenAI({
  // biome-ignore lint/style/useNamingConvention: third-party controlled
  baseURL: "https://opencode.ai/zen/v1/responses",
  apiKey: process.env["OPENCODE_ZEN_API_TOKEN"] ?? "",
});

const opencodeZenModels = {
  "glm-4-7": completionsClient("glm-4.7"),
  "glm-5": completionsClient("glm-5"),
  "glm-5-1": completionsClient("glm-5.1"),
  "opus-4-6": messagesClient("claude-opus-4.6"),
  "minimax-m2.5": completionsClient("minimax-m2.5"),
  "minimax-m2.7": completionsClient("minimax-m2.7"),
  "gpt-5.2-codex": responsesClient.responses("gpt-5.2-codex"),
  "kimi-k2-5": completionsClient("kimi-k2.5"),
  "kimi-k2-6": completionsClient("kimi-k2.6"),
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
  "opencode:glm-5": {
    id: "opencode:glm-5",
    provider: "opencode",
    contextWindow: 204800,
    maxOutputTokens: 64800,
    defaultTemperature: 0.5,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.000001,
    costPerOutputToken: 0.0000032,
  },
  "opencode:glm-5-1": {
    id: "opencode:glm-5-1",
    provider: "opencode",
    contextWindow: 202752,
    maxOutputTokens: 202752,
    defaultTemperature: 0.5,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.0000014,
    costPerOutputToken: 0.0000044,
  },
  "opencode:opus-4-6": {
    id: "opencode:opus-4-6",
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
  "opencode:gpt-5.2-codex": {
    id: "opencode:gpt-5.2-codex",
    provider: "opencode",
    contextWindow: 400000,
    maxOutputTokens: 128000,
    defaultTemperature: -1,
    promptFormat: "xml",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.00000175,
    costPerOutputToken: 0.000014,
  },
  "opencode:kimi-k2-5": {
    id: "opencode:kimi-k2-5",
    provider: "opencode",
    contextWindow: 262144,
    maxOutputTokens: 262144,
    defaultTemperature: 1.0,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 6e-7,
    costPerOutputToken: 0.000003,
  },
  "opencode:kimi-k2-6": {
    id: "opencode:kimi-k2-6",
    provider: "opencode",
    contextWindow: 256000,
    maxOutputTokens: 65536,
    defaultTemperature: 1.0,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 7.448e-7,
    costPerOutputToken: 0.000004655,
  },
  "opencode:minimax-m2.5": {
    id: "opencode:minimax-m2.5",
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
  "opencode:minimax-m2.7": {
    id: "opencode:minimax-m2.7",
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
};
