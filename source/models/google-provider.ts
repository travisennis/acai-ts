import { google as originalGoogle } from "@ai-sdk/google";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

const googleModels = {} as const;

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
> = {} as Record<ModelName, ModelMetadata<ModelName>>;
