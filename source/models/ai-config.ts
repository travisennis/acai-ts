import type { SharedV2ProviderMetadata } from "@ai-sdk/provider";
import type { ModelMetadata } from "./providers.ts";

type Effort = "none" | "low" | "medium" | "high";

const THINKING_TIERS: {
  pattern: RegExp;
  budget: number;
  effort: Effort;
}[] = [
  {
    pattern:
      /\b(ultrathink|think super hard|think really hard|think intensely)\b/i,
    budget: 31999,
    effort: "high",
  },
  {
    pattern: /\b(megathink|think (very )?hard|think (a lot|more|about it))\b/i,
    budget: 10000,
    effort: "medium",
  },
  {
    pattern: /\bthink\b/i, // Catch-all for standalone "think"
    budget: 4000,
    effort: "low",
  },
];

function calculateThinkingLevel(userInput: string): {
  tokenBudget: number;
  effort: Effort;
} {
  let tokenBudget = 0; // Default
  let effort: Effort = "none";
  for (const tier of THINKING_TIERS) {
    if (tier.pattern.test(userInput)) {
      tokenBudget = tier.budget;
      effort = tier.effort;
      break; // Use highest priority match
    }
  }
  return { tokenBudget, effort };
}

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

  maxOutputTokens() {
    const modelConfig = this.modelMetadata;
    const thinkingLevel = calculateThinkingLevel(this.prompt);
    const maxTokens =
      modelConfig.provider === "anthropic" && modelConfig.supportsReasoning
        ? modelConfig.maxOutputTokens - thinkingLevel.tokenBudget
        : modelConfig.maxOutputTokens;
    return maxTokens;
  }

  temperature() {
    const temp = this.modelMetadata.defaultTemperature;
    return temp > -1 ? temp : undefined;
  }

  topP() {
    const modelId = this.modelMetadata.id;
    if (modelId.toLowerCase().includes("qwen")) return 1;
    return undefined;
  }

  providerOptions(): SharedV2ProviderMetadata {
    const modelConfig = this.modelMetadata;
    const thinkingLevel = calculateThinkingLevel(this.prompt);

    if (modelConfig.supportsReasoning && thinkingLevel.effort !== "none") {
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
          return {
            google: {
              thinkingConfig: {
                thinkingBudget: thinkingLevel.tokenBudget,
              },
            },
          };
        }
        case "openrouter": {
          return {
            openrouter: {
              reasoning: {
                enabled: true,
                effort: thinkingLevel.effort,
              },
            },
          };
        }
        default:
          return {};
      }
    }
    // If supportsReasoning is false, or no provider case matched
    return {};
  }
}
