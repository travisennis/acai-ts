import type { LanguageModelV1ProviderMetadata } from "@ai-sdk/provider";
import type { ModelMetadata } from "./providers.ts";
import { calculateThinkingLevel } from "./reasoning.ts";

export class AiConfig {
  private modelMetadata: ModelMetadata;
  private prompt: string;
  constructor({
    modelMetadata,
    prompt,
  }: { modelMetadata: ModelMetadata; prompt: string }) {
    this.modelMetadata = modelMetadata;
    this.prompt = prompt;
  }

  getMaxTokens() {
    const modelConfig = this.modelMetadata;
    const thinkingLevel = calculateThinkingLevel(this.prompt);
    const maxTokens =
      modelConfig.provider === "anthropic" && modelConfig.supportsReasoning
        ? modelConfig.maxOutputTokens - thinkingLevel.tokenBudget
        : modelConfig.maxOutputTokens;
    return maxTokens;
  }

  getProviderOptions(): LanguageModelV1ProviderMetadata {
    const modelConfig = this.modelMetadata;
    const thinkingLevel = calculateThinkingLevel(this.prompt);
    return modelConfig.provider === "anthropic" && modelConfig.supportsReasoning
      ? {
          anthropic: {
            thinking: {
              type: "enabled",
              budgetTokens: thinkingLevel.tokenBudget,
            },
          },
        }
      : modelConfig.supportsReasoning && modelConfig.provider === "openai"
        ? { openai: { reasoningEffort: thinkingLevel.effort } }
        : {};
  }
}
