import { google as originalGoogle } from "@ai-sdk/google";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

const googleModels = {
  flash2: originalGoogle("gemini-2.0-flash"),
  "flash2-search": originalGoogle("gemini-2.0-flash", {
    useSearchGrounding: true,
  }),
  flash2lite: originalGoogle("gemini-2.0-flash-lite,"),
  flash2thinking: originalGoogle("gemini-2.0-flash-thinking-exp-01-21"),
  "pro25-free": originalGoogle("gemini-2.5-pro-exp-03-25"),
  pro25: originalGoogle("gemini-2.5-pro-preview-05-06"),
  flash25: originalGoogle("gemini-2.5-flash-preview-04-17"),
} as const;

type ModelName = `google:${keyof typeof googleModels}`;

export const googleModelNames: ModelName[] = objectKeys(googleModels).map(
  (key) => `google:${key}` as const,
);

export const googleProvider = {
  google: customProvider({
    languageModels: googleModels,
    fallbackProvider: originalGoogle,
  }),
};

export const googleModelRegistry: Record<
  ModelName,
  ModelMetadata<ModelName>
> = {
  "google:flash2": {
    id: "google:flash2",
    provider: "google",
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
    provider: "google",
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
    provider: "google",
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
    provider: "google",
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
  "google:pro25": {
    id: "google:pro25",
    provider: "google",
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
  "google:pro25-free": {
    id: "google:pro25-free",
    provider: "google",
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
  "google:flash25": {
    id: "google:flash25",
    provider: "google",
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    defaultTemperature: 0.3,
    promptFormat: "markdown",
    supportsReasoning: true,
    supportsToolCalling: true,
    costPerInputToken: 0.00000015,
    costPerOutputToken: 0.0000035,
    category: "balanced",
  },
};
