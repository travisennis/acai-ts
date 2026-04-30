import { groq as originalGroq } from "@ai-sdk/groq";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

const groqModels = {} as const;

type ModelName = `groq:${keyof typeof groqModels}`;

export const groqModelNames: ModelName[] = objectKeys(groqModels).map(
  (key) => `groq:${key}` as const,
);

export const groqProvider = {
  groq: customProvider({
    languageModels: groqModels,
    fallbackProvider: originalGroq,
  }),
};

export const groqModelRegistry: {
  [K in ModelName]: ModelMetadata<ModelName>;
} = {} as { [K in ModelName]: ModelMetadata<ModelName> };
