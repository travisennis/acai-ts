import { createAlibaba } from "@ai-sdk/alibaba";
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

const alibabaClient = createAlibaba({
  apiKey: process.env["OPENCODE_ZEN_API_TOKEN"] ?? "",
  // biome-ignore lint/style/useNamingConvention: third-party controlled
  baseURL: "https://opencode.ai/zen/go/v1",
});

const opencodeGoModels = {
  "deepseek-v4-flash": messagesClient("deepseek-v4-flash"),
  "deepseek-v4-pro": messagesClient("deepseek-v4-pro"),
  "glm-5": completionsClient("glm-5"),
  "glm-5-1": completionsClient("glm-5.1"),
  "kimi-k2-5": completionsClient("kimi-k2.5"),
  "kimi-k2-6": completionsClient("kimi-k2.6"),
  "minimax-m2-5": messagesClient("minimax-m2.5"),
  "minimax-m2-7": messagesClient("minimax-m2.7"),
  "mimo-v2-5": completionsClient("mimo-v2.5"),
  "mimo-v2-5-pro": completionsClient("mimo-v2.5-pro"),
  "mimo-v2-pro": completionsClient("mimo-v2-pro"),
  "mimo-v2-omni": completionsClient("mimo-v2-omni"),
  "qwen3.6-plus": alibabaClient("qwen3.6-plus"),
  "qwen3.5-plus": alibabaClient("qwen3.5-plus"),
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
  "opencode-go:deepseek-v4-flash": {
    id: "opencode-go:deepseek-v4-flash",
    provider: "opencode-go",
    contextWindow: 1048576,
    maxOutputTokens: 384000,
    defaultTemperature: 0.5,
    promptFormat: "bracket",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.00000014,
    costPerOutputToken: 0.00000028,
  },
  "opencode-go:deepseek-v4-pro": {
    id: "opencode-go:deepseek-v4-pro",
    provider: "opencode-go",
    contextWindow: 1048576,
    maxOutputTokens: 384000,
    defaultTemperature: 0.5,
    promptFormat: "bracket",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.00000174,
    costPerOutputToken: 0.00000348,
  },
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
  "opencode-go:glm-5-1": {
    id: "opencode-go:glm-5-1",
    provider: "opencode-go",
    contextWindow: 202752,
    maxOutputTokens: 202752,
    defaultTemperature: 0.5,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.0000014,
    costPerOutputToken: 0.0000044,
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
  "opencode-go:kimi-k2-6": {
    id: "opencode-go:kimi-k2-6",
    provider: "opencode-go",
    contextWindow: 256000,
    maxOutputTokens: 65536,
    defaultTemperature: 1.0,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 7.448e-7,
    costPerOutputToken: 0.000004655,
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
  "opencode-go:minimax-m2-7": {
    id: "opencode-go:minimax-m2-7",
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
  "opencode-go:mimo-v2-5": {
    id: "opencode-go:mimo-v2-5",
    provider: "opencode-go",
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    defaultTemperature: 1.0,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.0000004,
    costPerOutputToken: 0.000002,
  },
  "opencode-go:mimo-v2-5-pro": {
    id: "opencode-go:mimo-v2-5-pro",
    provider: "opencode-go",
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    defaultTemperature: 1.0,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.000001,
    costPerOutputToken: 0.000003,
  },
  "opencode-go:mimo-v2-pro": {
    id: "opencode-go:mimo-v2-pro",
    provider: "opencode-go",
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    defaultTemperature: 1.0,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.000001,
    costPerOutputToken: 0.000003,
  },
  "opencode-go:mimo-v2-omni": {
    id: "opencode-go:mimo-v2-omni",
    provider: "opencode-go",
    contextWindow: 262144,
    maxOutputTokens: 65536,
    defaultTemperature: 1.0,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 4e-7,
    costPerOutputToken: 0.000002,
  },
  "opencode-go:qwen3.6-plus": {
    id: "opencode-go:qwen3.6-plus",
    provider: "opencode-go",
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    defaultTemperature: 1.0,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 3.25e-7,
    costPerOutputToken: 0.00000195,
  },
  "opencode-go:qwen3.5-plus": {
    id: "opencode-go:qwen3.5-plus",
    provider: "opencode-go",
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    defaultTemperature: 1.0,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 2.6e-7,
    costPerOutputToken: 0.00000156,
  },
};
