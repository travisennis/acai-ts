import { createGroq, groq as originalGroq } from "@ai-sdk/groq";
import { objectKeys } from "@travisennis/stdlib/object";
import { customProvider } from "ai";
import type { ModelMetadata } from "./providers.ts";

const groq = createGroq({
  apiKey: process.env["GROQ_API_KEY"] ?? "",
});

const groqModels = {
  "kimi-k2-instruct-0905": groq("moonshotai/kimi-k2-instruct-0905"),
} as const;

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
} = {
  "groq:kimi-k2-instruct-0905": {
    id: "groq:kimi-k2-instruct-0905",
    provider: "groq",
    contextWindow: 262144,
    maxOutputTokens: 16384,
    defaultTemperature: 0.1,
    promptFormat: "markdown",
    supportsReasoning: false,
    supportsToolCalling: true,
    costPerInputToken: 1 / 1000000,
    costPerOutputToken: 3 / 1000000,
  },
};
