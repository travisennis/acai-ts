import {
  createAnthropic,
  anthropic as originalAnthropic,
} from "@ai-sdk/anthropic";
import { isRecord } from "@travisennis/stdlib/typeguards";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

// Helper function copied from original providers.ts
function addCacheControlToTools(body: string) {
  const parsedBody = JSON.parse(body);
  if (isRecord(parsedBody)) {
    const tools = parsedBody["tools"];
    if (Array.isArray(tools)) {
      tools.at(-1).cache_control = { type: "ephemeral" };
    }
  }
  return JSON.stringify(parsedBody);
}

const anthropicModels = {
  sonnet: createAnthropic({
    fetch(input, init) {
      const body = init?.body;
      if (body && typeof body === "string") {
        init.body = addCacheControlToTools(body);
      }
      return fetch(input, init);
    },
  })("claude-3-7-sonnet-20250219"),
  "sonnet-token-efficient-tools": createAnthropic({
    headers: {
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "token-efficient-tools-2025-02-19",
    },
    fetch(input, init) {
      const body = init?.body;
      if (body && typeof body === "string") {
        init.body = addCacheControlToTools(body);
      }
      return fetch(input, init);
    },
  })("claude-3-7-sonnet-20250219"),
  "sonnet-128k": createAnthropic({
    headers: {
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "output-128k-2025-02-19",
    },
    fetch(input, init) {
      const body = init?.body;
      if (body && typeof body === "string") {
        init.body = addCacheControlToTools(body);
      }
      return fetch(input, init);
    },
  })("claude-3-7-sonnet-20250219"),
  sonnet35: createAnthropic({
    headers: {
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "max-tokens-3-5-sonnet-2024-07-15",
    },
    fetch(input, init) {
      const body = init?.body;
      if (body && typeof body === "string") {
        init.body = addCacheControlToTools(body);
      }
      return fetch(input, init);
    },
  })("claude-3-5-sonnet-20241022"),
  haiku: originalAnthropic("claude-3-5-haiku-20241022"),
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
    category: "balanced",
  },
  "anthropic:sonnet-token-efficient-tools": {
    id: "anthropic:sonnet-token-efficient-tools",
    provider: "anthropic",
    contextWindow: 200000,
    maxOutputTokens: 64000,
    defaultTemperature: 0.3,
    promptFormat: "xml",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    category: "balanced",
  },
  "anthropic:sonnet-128k": {
    id: "anthropic:sonnet-128k",
    provider: "anthropic",
    contextWindow: 200000,
    maxOutputTokens: 128000,
    defaultTemperature: 0.3,
    promptFormat: "xml",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    category: "powerful",
  },
  "anthropic:sonnet35": {
    id: "anthropic:sonnet35",
    provider: "anthropic",
    contextWindow: 200000,
    maxOutputTokens: 8096,
    defaultTemperature: 0.3,
    promptFormat: "xml",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    category: "balanced",
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
    category: "fast",
  },
};
