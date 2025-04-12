import { google as originalGoogle } from "@ai-sdk/google";
import { customProvider } from "ai";
import type { ModelMetadata, ModelProvider } from "./providers.ts";

export const googleProvider = {
  google: customProvider({
    languageModels: {
      flash2: originalGoogle("gemini-2.0-flash"),
      "flash2-search": originalGoogle("gemini-2.0-flash", {
        useSearchGrounding: true,
      }),
      flash2lite: originalGoogle("gemini-2.0-flash-lite-preview-02-05"),
      flash2thinking: originalGoogle("gemini-2.0-flash-thinking-exp-01-21"),
      pro2: originalGoogle("gemini-2.0-pro-exp-02-05"),
      "pro25-free": originalGoogle("gemini-2.5-pro-exp-03-25"),
      pro25: originalGoogle("gemini-2.5-pro-preview-03-25"),
    },
    fallbackProvider: originalGoogle,
  }),
};

export const googleModelNames = [
  "google:flash2",
  "google:flash2lite",
  "google:flash2-search",
  "google:flash2thinking",
  "google:pro2",
  "google:pro25",
  "google:pro25-free",
] as const;

export type GoogleModelName = (typeof googleModelNames)[number];

export const googleModelRegistry: Record<
  GoogleModelName,
  ModelMetadata<GoogleModelName>
> = {
  "google:flash2": {
    id: "google:flash2",
    provider: "google" as ModelProvider,
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "balanced",
  },
  "google:flash2lite": {
    id: "google:flash2lite",
    provider: "google" as ModelProvider,
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "fast",
  },
  "google:flash2-search": {
    id: "google:flash2-search",
    provider: "google" as ModelProvider,
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "balanced",
  },
  "google:flash2thinking": {
    id: "google:flash2thinking",
    provider: "google" as ModelProvider,
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "balanced",
  },
  "google:pro2": {
    id: "google:pro2",
    provider: "google" as ModelProvider,
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "balanced",
  },
  "google:pro25": {
    id: "google:pro25",
    provider: "google" as ModelProvider,
    contextWindow: 1000000,
    maxOutputTokens: 64000,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "powerful",
  },
  "google:pro25-free": {
    id: "google:pro25-free",
    provider: "google" as ModelProvider,
    contextWindow: 1000000,
    maxOutputTokens: 64000,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    category: "powerful",
  },
};
