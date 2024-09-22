import {
  createAnthropic,
  anthropic as originalAnthropic,
} from "@ai-sdk/anthropic";
import { experimental_createProviderRegistry as createProviderRegistry } from "ai";
import { experimental_customProvider as customProvider } from "ai";
import { openai as originalOpenAI } from "@ai-sdk/openai";
import { createAzure } from "@ai-sdk/azure";

const azure = customProvider({
  languageModels: {
    text: createAzure({
      resourceName: process.env.AZURE_RESOURCE_NAME,
      apiKey: process.env.AZURE_API_KEY,
    })(process.env.AZURE_DEPLOYMENT_NAME ?? ""),
  },
});

const anthropic = customProvider({
  languageModels: {
    opus: originalAnthropic("claude-3-opus-20240229"),
    sonnet: createAnthropic({
      headers: {
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "max-tokens-3-5-sonnet-2024-07-15",
      },
    })("claude-3-5-sonnet-20240620", {
      cacheControl: true,
    }),
    haiku: originalAnthropic("claude-3-haiku-20240307"),
  },
  fallbackProvider: originalAnthropic,
});

const openai = customProvider({
  languageModels: {
    "gpt-4o": originalOpenAI("gpt-4o-2024-08-06"),
    "gpt-4o-mini": originalOpenAI("gpt-4o-mini"),
    "gpt-4o-structured": originalOpenAI("gpt-4o-2024-08-06", {
      structuredOutputs: true,
    }),
    "gpt-4o-mini-structured": originalOpenAI("gpt-4o-mini", {
      structuredOutputs: true,
    }),
  },
  fallbackProvider: originalOpenAI,
});

const registry = createProviderRegistry({
  anthropic,
  openai,
  azure,
});

type AnthropicModels = "opus" | "sonnet" | "haiku";
type OpenAIModels =
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-4o-structured"
  | "gpt-4o-mini-structured";

type ModelNames =
  | `anthropic:${AnthropicModels}`
  | `openai:${OpenAIModels}`
  | "azure:text";

export function model(input: ModelNames) {
  return registry.languageModel(input);
}
