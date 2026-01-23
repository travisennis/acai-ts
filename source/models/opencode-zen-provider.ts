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
  "opus-4-5": messagesClient("claude-opus-4.5"),
  "gpt-5.2-codex": responsesClient.responses("gpt-5.2-codex"),
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
};
