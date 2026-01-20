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
        // After AI SDK v6 upgrade, all usage is in the unified format
        const inputTokens = usage.inputTokens ?? 0;
        const outputTokens = usage.outputTokens ?? 0;
        const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;

        acc.inputTokens += isNumber(inputTokens) ? inputTokens : 0;
        acc.outputTokens += isNumber(outputTokens) ? outputTokens : 0;
        acc.totalTokens += isNumber(totalTokens) ? totalTokens : 0;

        // Input token details
        acc.inputTokenDetails.noCacheTokens +=
          usage.inputTokenDetails?.noCacheTokens ?? 0;
        acc.inputTokenDetails.cacheReadTokens +=
          usage.inputTokenDetails?.cacheReadTokens ?? 0;
        acc.inputTokenDetails.cacheWriteTokens +=
          usage.inputTokenDetails?.cacheWriteTokens ?? 0;

        // Output token details
        const v3OutputDetails = usage.outputTokenDetails;
        acc.outputTokenDetails.textTokens += v3OutputDetails?.textTokens ?? 0;
        acc.outputTokenDetails.reasoningTokens +=
          v3OutputDetails?.reasoningTokens ?? 0;

        return acc;
      },
      {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        inputTokenDetails: {
          noCacheTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
      },
    );
  }

  getUsageByApp(app: string): LanguageModelUsage {
    return this.usages
      .filter(({ tool }) => tool === app)
      .reduce(
        (acc, { usage }) => {
          const inputTokens = usage.inputTokens ?? 0;
          const outputTokens = usage.outputTokens ?? 0;
          const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;

          acc.inputTokens += isNumber(inputTokens) ? inputTokens : 0;
          acc.outputTokens += isNumber(outputTokens) ? outputTokens : 0;
          acc.totalTokens += isNumber(totalTokens) ? totalTokens : 0;

          const v3InputDetails = usage.inputTokenDetails;
          acc.inputTokenDetails.cacheReadTokens +=
            v3InputDetails?.cacheReadTokens ?? 0;
          acc.inputTokenDetails.noCacheTokens +=
            v3InputDetails?.noCacheTokens ?? 0;
          acc.inputTokenDetails.cacheWriteTokens +=
            v3InputDetails?.cacheWriteTokens ?? 0;

          const v3OutputDetails = usage.outputTokenDetails;
          acc.outputTokenDetails.textTokens += v3OutputDetails?.textTokens ?? 0;
          acc.outputTokenDetails.reasoningTokens +=
            v3OutputDetails?.reasoningTokens ?? 0;

          return acc;
        },
        {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          inputTokenDetails: {
            noCacheTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
        },
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

  reset() {
    this.usages = [];
  }

  printSummary() {
    const breakdown = this.getUsageBreakdown();
    console.info("Token Usage Summary:", {
      total: this.getTotalUsage(),
      breakdown,
    });
  }
}
