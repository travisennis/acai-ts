import { EventEmitter } from "node:events";
import type { LanguageModelUsage } from "ai";

export interface TokenUsage {
  tool: string;
  usage: LanguageModelUsage;
}

export class TokenTracker extends EventEmitter {
  private usages: TokenUsage[] = [];
  private budget?: number;

  constructor(budget?: number) {
    super();
    this.budget = budget;

    if ("asyncLocalContext" in process) {
      const asyncLocalContext = process.asyncLocalContext as any;
      this.on("usage", () => {
        if (asyncLocalContext.available()) {
          asyncLocalContext.ctx.chargeAmount = this.getTotalUsage().totalTokens;
        }
      });
    }
  }

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
      budget: this.budget,
      total: this.getTotalUsage(),
      breakdown,
    });
  }

  reset() {
    this.usages = [];
  }
}
