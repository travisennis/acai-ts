import { google as originalGoogle } from "@ai-sdk/google";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

const googleModels = {
  flash25lite: originalGoogle("gemini-2.5-flash-lite-preview-06-17"),
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
  },
};
