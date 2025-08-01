import { google as originalGoogle } from "@ai-sdk/google";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

const googleModels = {
  flash25lite: originalGoogle("gemini-2.5-flash-lite-preview-06-17"),
  pro25: originalGoogle("gemini-2.5-pro"),
  flash25: originalGoogle("gemini-2.5-flash"),
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
  "google:flash25lite": {
    id: "google:flash25lite",
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
  "google:pro25": {
    id: "google:pro25",
    provider: "google",
    contextWindow: 1000000,
    maxOutputTokens: 64000,
    defaultTemperature: 0.7,
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
