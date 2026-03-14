import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

const completionsClient = createOpenAICompatible({
  name: "opencode-go",
  apiKey: process.env["OPENCODE_ZEN_API_TOKEN"] ?? "",
  // biome-ignore lint/style/useNamingConvention: third-party controlled
  baseURL: "https://opencode.ai/zen/go/v1",
});

const messagesClient = createAnthropic({
  // biome-ignore lint/style/useNamingConvention: third-party controlled
  baseURL: "https://opencode.ai/zen/go/v1",
  apiKey: process.env["OPENCODE_ZEN_API_TOKEN"] ?? "",
});

const opencodeGoModels = {
  "glm-5": completionsClient("glm-5"),
  "kimi-k2-5": completionsClient("kimi-k2.5"),
  "minimax-m2-5": messagesClient("minimax-m2.5"),
} as const;

type ModelName = `opencode-go:${keyof typeof opencodeGoModels}`;

export const opencodeGoModelNames: ModelName[] = objectKeys(
  opencodeGoModels,
).map((key) => `opencode-go:${key}` as const);

export const opencodeGoProvider = {
  "opencode-go": customProvider({
    languageModels: opencodeGoModels,
    fallbackProvider: completionsClient,
  }),
};

export const opencodeGoModelRegistry: {
  [K in ModelName]: ModelMetadata<ModelName>;
} = {
  "opencode-go:glm-5": {
    id: "opencode-go:glm-5",
    provider: "opencode-go",
    contextWindow: 204800,
    maxOutputTokens: 64800,
    defaultTemperature: 0.5,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.000001,
    costPerOutputToken: 0.0000032,
  },
  "opencode-go:kimi-k2-5": {
    id: "opencode-go:kimi-k2-5",
    provider: "opencode-go",
    contextWindow: 262144,
    maxOutputTokens: 8192,
    defaultTemperature: 1.0,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 6e-7,
    costPerOutputToken: 0.000003,
  },
  "opencode-go:minimax-m2-5": {
    id: "opencode-go:minimax-m2-5",
    provider: "opencode-go",
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
