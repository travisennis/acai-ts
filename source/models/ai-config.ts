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

    if (modelConfig.supportsReasoning) {
      switch (modelConfig.provider) {
        case "anthropic":
          return {
            anthropic: {
              thinking: {
                type: "enabled",
                budgetTokens: thinkingLevel.tokenBudget,
              },
            },
          };
        case "openai":
          return { openai: { reasoningEffort: thinkingLevel.effort } };
        case "google": {
          // Only flash25 currently supports the thinking budget
          if (modelConfig.id === "google:flash25") {
            return {
              google: {
                thinkingConfig: {
                  thinkingBudget: thinkingLevel.tokenBudget,
                },
              },
            };
          }
          return {};
        }
        default:
          return {};
      }
    }
    // If supportsReasoning is false, or no provider case matched
    return {};
  }
}
