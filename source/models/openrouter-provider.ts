// import { createOpenAI } from "@ai-sdk/openai";
// import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV2, ProviderV2 } from "@ai-sdk/provider";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

// const openRouterClient = createOpenAICompatible({
//   name: "openrouter",
//   apiKey: process.env["OPENROUTER_API_KEY"] ?? "",
//   // biome-ignore lint/style/useNamingConvention: third-party controlled
//   baseURL: "https://openrouter.ai/api/v1",
//   headers: {
//     "HTTP-Referer": "https://github.com/travisennis/acai-ts",
//     "X-Title": "acai",
//   },
// });

const openRouterClient = createOpenRouter({
  apiKey: process.env["OPENROUTER_API_KEY"] ?? "",
  headers: {
    "HTTP-Referer": "https://github.com/travisennis/acai-ts",
    "X-Title": "acai",
  },
});

// const openRouterResponseClient = createOpenAI({
//   // biome-ignore lint/style/useNamingConvention: third-party controlled
//   baseURL: "https://openrouter.ai/api/alpha",
//   name: "openrouter",
//   apiKey: process.env["OPENROUTER_API_KEY"] ?? "",
//   headers: {
//     "HTTP-Referer": "https://github.com/travisennis/acai-ts",
//     "X-Title": "acai",
//   },
// });

const openrouterModels = {
  "deepseek-v3-1": openRouterClient("deepseek/deepseek-v3.1-terminus:exacto", {
    usage: { include: true },
  }) as LanguageModelV2,
  "deepseek-r1": openRouterClient("deepseek/deepseek-r1-0528", {
    usage: { include: true },
  }) as LanguageModelV2,
  "gemini-flash25": openRouterClient("google/gemini-2.5-flash", {
    usage: { include: true },
  }) as LanguageModelV2,
  "gemini-pro25": openRouterClient("google/gemini-2.5-pro", {
    usage: { include: true },
  }) as LanguageModelV2,
  "sonnet-4.5": openRouterClient("anthropic/claude-sonnet-4.5", {
    usage: { include: true },
  }) as LanguageModelV2,
  "opus-4.1": openRouterClient("anthropic/claude-opus-4.1", {
    usage: { include: true },
  }) as LanguageModelV2,
  "haiku-4.5": openRouterClient("anthropic/claude-haiku-4.5", {
    usage: { include: true },
  }) as LanguageModelV2,
  "kimi-k2": openRouterClient("moonshotai/kimi-k2-0905:exacto", {
    usage: { include: true },
  }) as LanguageModelV2,
  "kimi-k2-thinking": openRouterClient("moonshotai/kimi-k2-thinking", {
    usage: { include: true },
  }) as LanguageModelV2,
  "devstral-medium": openRouterClient("mistralai/devstral-medium", {
    usage: { include: true },
  }) as LanguageModelV2,
  "qwen3-coder": openRouterClient("qwen/qwen3-coder:exacto", {
    usage: { include: true },
  }) as LanguageModelV2,
  "qwen3-coder-plus": openRouterClient("qwen/qwen3-coder-plus", {
    usage: { include: true },
  }) as LanguageModelV2,
  "qwen3-max": openRouterClient("qwen/qwen3-max", {
    usage: { include: true },
  }) as LanguageModelV2,
  "polaris-alpha": openRouterClient("openrouter/polaris-alpha", {
    usage: { include: true },
  }) as LanguageModelV2,
  "glm-4.6": openRouterClient("z-ai/glm-4.6:exacto", {
    usage: { include: true },
  }) as LanguageModelV2,
  "gpt-5": openRouterClient("openai/gpt-5", {
    usage: { include: true },
  }) as LanguageModelV2,
  "gpt-5-mini": openRouterClient("openai/gpt-5-mini", {
    usage: { include: true },
  }) as LanguageModelV2,
  "gpt-oss-120b": openRouterClient("openai/gpt-oss-120b:exacto", {
    usage: { include: true },
  }) as LanguageModelV2,
  "grok-code-fast-1": openRouterClient("x-ai/grok-code-fast-1", {
    usage: { include: true },
  }) as LanguageModelV2,
  "grok-4-fast": openRouterClient("x-ai/grok-4-fast", {
    usage: { include: true },
  }) as LanguageModelV2,
  "gpt-5-codex": openRouterClient("openai/gpt-5-codex", {
    usage: { include: true },
  }) as LanguageModelV2,
  "minimax-m2": openRouterClient("minimax/minimax-m2", {
    usage: { include: true },
  }) as LanguageModelV2,
  "minimax-m2-free": openRouterClient("minimax/minimax-m2:free", {
    usage: { include: true },
  }) as LanguageModelV2,
} as const;

type ModelName = `openrouter:${keyof typeof openrouterModels}`;

export const openrouterModelNames: ModelName[] = objectKeys(
  openrouterModels,
).map((key) => `openrouter:${key}` as const);

export const openrouterProvider = {
  openrouter: customProvider({
    languageModels: openrouterModels,
    fallbackProvider: openRouterClient as unknown as ProviderV2,
  }),
};

export const openrouterModelRegistry: {
  [K in ModelName]: ModelMetadata<ModelName>;
} = {
  "openrouter:deepseek-r1": {
    id: "openrouter:deepseek-r1",
    provider: "openrouter",
    contextWindow: 128000,
    maxOutputTokens: 32768,
    defaultTemperature: 0.6,
    promptFormat: "bracket",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0, // Assuming free tier or unknown cost
    costPerOutputToken: 0, // Assuming free tier or unknown cost
    category: "balanced",
  },
  "openrouter:deepseek-v3-1": {
    id: "openrouter:deepseek-v3-1",
    provider: "openrouter",
    contextWindow: 163840,
    maxOutputTokens: 8000,
    defaultTemperature: 0.3,
    promptFormat: "bracket",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.0000002,
    costPerOutputToken: 0.0000008,
    category: "balanced",
  },
  "openrouter:gemini-flash25": {
    id: "openrouter:gemini-flash25",
    provider: "openrouter",
    contextWindow: 1000000,
    maxOutputTokens: 66000,
    defaultTemperature: 0.5,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "fast",
  },
  "openrouter:gemini-pro25": {
    id: "openrouter:gemini-pro25",
    provider: "openrouter",
    contextWindow: 1000000,
    maxOutputTokens: 64000,
    defaultTemperature: 0.5,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "powerful",
  },

  "openrouter:opus-4.1": {
    id: "openrouter:opus-4.1",
    provider: "openrouter",
    contextWindow: 200000,
    maxOutputTokens: 32000,
    defaultTemperature: 0.5,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.000015,
    costPerOutputToken: 0.000075,
    category: "powerful",
  },

  "openrouter:sonnet-4.5": {
    id: "openrouter:sonnet-4.5",
    provider: "openrouter",
    contextWindow: 1000000,
    maxOutputTokens: 64000,
    defaultTemperature: 1.0,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    category: "powerful",
  },
  "openrouter:kimi-k2": {
    id: "openrouter:kimi-k2",
    provider: "openrouter",
    contextWindow: 262144,
    maxOutputTokens: 8192,
    defaultTemperature: 0.6,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.0000006,
    costPerOutputToken: 0.0000025,
    category: "balanced",
  },
  "openrouter:kimi-k2-thinking": {
    id: "openrouter:kimi-k2-thinking",
    provider: "openrouter",
    contextWindow: 262144,
    maxOutputTokens: 8192,
    defaultTemperature: 0.6,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.0000006,
    costPerOutputToken: 0.0000025,
    category: "powerful",
  },
  "openrouter:devstral-medium": {
    id: "openrouter:devstral-medium",
    provider: "openrouter",
    contextWindow: 131000,
    maxOutputTokens: 8192,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.0000004,
    costPerOutputToken: 0.000002,
    category: "balanced",
  },
  "openrouter:qwen3-coder": {
    id: "openrouter:qwen3-coder",
    provider: "openrouter",
    contextWindow: 262000,
    maxOutputTokens: 66000,
    defaultTemperature: 0.55,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.0000004,
    costPerOutputToken: 0.000002,
    category: "balanced",
  },
  "openrouter:qwen3-coder-plus": {
    id: "openrouter:qwen3-coder-plus",
    provider: "openrouter",
    contextWindow: 128000,
    maxOutputTokens: 65536,
    defaultTemperature: 0.55,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.000001,
    costPerOutputToken: 0.000005,
    category: "powerful",
  },
  "openrouter:qwen3-max": {
    id: "openrouter:qwen3-max",
    provider: "openrouter",
    contextWindow: 256000,
    maxOutputTokens: 32768,
    defaultTemperature: 0.55,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.0000012,
    costPerOutputToken: 0.000006,
    category: "powerful",
  },
  "openrouter:polaris-alpha": {
    id: "openrouter:polaris-alpha",
    provider: "openrouter",
    contextWindow: 256000,
    maxOutputTokens: 128000,
    defaultTemperature: 0.6,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "powerful",
  },
  "openrouter:glm-4.6": {
    id: "openrouter:glm-4.6",
    provider: "openrouter",
    contextWindow: 200000,
    maxOutputTokens: 128000,
    defaultTemperature: 0.6,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.0000006,
    costPerOutputToken: 0.0000022,
    category: "balanced",
  },
  "openrouter:gpt-5": {
    id: "openrouter:gpt-5",
    provider: "openrouter",
    contextWindow: 400000,
    maxOutputTokens: 128000,
    defaultTemperature: 1.0,
    promptFormat: "xml",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.00000125,
    costPerOutputToken: 0.00001,
    category: "powerful",
  },
  "openrouter:gpt-5-codex": {
    id: "openrouter:gpt-5-codex",
    provider: "openrouter",
    contextWindow: 400000,
    maxOutputTokens: 128000,
    defaultTemperature: -1,
    promptFormat: "xml",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.00000125,
    costPerOutputToken: 0.00001,
    category: "powerful",
  },
  "openrouter:gpt-5-mini": {
    id: "openrouter:gpt-5-mini",
    provider: "openrouter",
    contextWindow: 200000,
    maxOutputTokens: 64000,
    defaultTemperature: 1.0,
    promptFormat: "xml",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.00000015,
    costPerOutputToken: 0.0000006,
    category: "balanced",
  },
  "openrouter:grok-code-fast-1": {
    id: "openrouter:grok-code-fast-1",
    provider: "openrouter",
    contextWindow: 256000,
    maxOutputTokens: 10000,
    defaultTemperature: 0.5,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.0000002,
    costPerOutputToken: 0.0000015,
    category: "fast",
  },
  "openrouter:gpt-oss-120b": {
    id: "openrouter:gpt-oss-120b",
    provider: "openrouter",
    contextWindow: 131072,
    maxOutputTokens: 64000,
    defaultTemperature: 1.0,
    promptFormat: "xml",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.00000007256312,
    costPerOutputToken: 0.0000002903936,
    category: "fast",
  },
  "openrouter:grok-4-fast": {
    id: "openrouter:grok-4-fast",
    provider: "openrouter",
    contextWindow: 2000000,
    maxOutputTokens: 30000,
    defaultTemperature: 0.5,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.0000002,
    costPerOutputToken: 0.0000005,
    category: "fast",
  },
  "openrouter:haiku-4.5": {
    id: "openrouter:haiku-4.5",
    provider: "openrouter",
    contextWindow: 200000,
    maxOutputTokens: 32000,
    defaultTemperature: 1.0,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.000001,
    costPerOutputToken: 0.000005,
    category: "fast",
  },
  "openrouter:minimax-m2": {
    id: "openrouter:minimax-m2",
    provider: "openrouter",
    contextWindow: 196608,
    maxOutputTokens: 32768,
    defaultTemperature: 0.6,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.00000015,
    costPerOutputToken: 0.00000045,
    category: "balanced",
  },
  "openrouter:minimax-m2-free": {
    id: "openrouter:minimax-m2-free",
    provider: "openrouter",
    contextWindow: 204800,
    maxOutputTokens: 32768,
    defaultTemperature: 0.6,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "balanced",
  },
};
