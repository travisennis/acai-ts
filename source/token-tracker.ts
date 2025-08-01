import { EventEmitter } from "node:events";
import { isNumber } from "@travisennis/stdlib/typeguards";
import type { LanguageModelUsage } from "ai";

interface TokenUsage {
  tool: string;
  usage: Partial<LanguageModelUsage>;
}

interface TokenTrackerEvents {
  usage: [LanguageModelUsage];
}

export class TokenTracker extends EventEmitter<TokenTrackerEvents> {
  private usages: TokenUsage[] = [];

  trackUsage(tool: string, usage: LanguageModelUsage | undefined) {
    if (usage) {
      const u = { tool, usage };
      this.usages.push(u);
      this.emit("usage", usage);
    }
  }

  getTotalUsage(): LanguageModelUsage {
    return this.usages.reduce(
      (acc, { usage }) => {
        acc.inputTokens += isNumber(usage.inputTokens) ? usage.inputTokens : 0;
        acc.outputTokens += isNumber(usage.outputTokens)
          ? usage.outputTokens
          : 0;
        acc.totalTokens += isNumber(usage.totalTokens) ? usage.totalTokens : 0;
        return acc;
      },
      { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    );
  }

  getUsageByApp(app: string): LanguageModelUsage {
    return this.usages
      .filter(({ tool }) => tool === app)
      .reduce(
        (acc, { usage }) => {
          acc.inputTokens += isNumber(usage.inputTokens)
            ? usage.inputTokens
            : 0;
          acc.outputTokens += isNumber(usage.outputTokens)
            ? usage.outputTokens
            : 0;
          acc.totalTokens += isNumber(usage.totalTokens)
            ? usage.totalTokens
            : 0;
          return acc;
        },
        { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      );
  }

  getUsageBreakdown(): Record<string, number> {
    return this.usages.reduce(
      (acc, { tool, usage }) => {
        acc[tool] =
          (acc[tool] || 0) +
          (isNumber(usage.totalTokens) ? usage.totalTokens : 0);
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  printSummary() {
    const breakdown = this.getUsageBreakdown();
    console.info("Token Usage Summary:", {
      total: this.getTotalUsage(),
      breakdown,
    });
  }
}
