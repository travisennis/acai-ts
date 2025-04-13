import { EventEmitter } from "node:events";
import type { LanguageModelUsage } from "ai";

export interface TokenUsage {
  tool: string;
  usage: LanguageModelUsage;
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
        acc.promptTokens += usage.promptTokens;
        acc.completionTokens += usage.completionTokens;
        acc.totalTokens += usage.totalTokens;
        return acc;
      },
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    );
  }

  getUsageByApp(app: string): LanguageModelUsage {
    return this.usages
      .filter(({ tool }) => tool === app)
      .reduce(
        (acc, { usage }) => {
          acc.promptTokens += usage.promptTokens;
          acc.completionTokens += usage.completionTokens;
          acc.totalTokens += usage.totalTokens;
          return acc;
        },
        { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      );
  }

  getUsageBreakdown(): Record<string, number> {
    return this.usages.reduce(
      (acc, { tool, usage }) => {
        acc[tool] = (acc[tool] || 0) + usage.totalTokens;
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
