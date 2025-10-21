import type { ModelMessage } from "ai";
import { systemPrompt } from "../prompts.ts";
import { initCliTools } from "../tools/index.ts";
import { prepareTools } from "../tools/utils.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

type Breakdown = {
  systemPrompt: number;
  tools: number;
  messages: number;
  totalUsed: number;
  window: number;
  free: number;
};

/**
 * Count tokens from message history
 */
function countMessageTokens(
  messages: ModelMessage[],
  counter: { count: (s: string) => number },
): number {
  if (messages.length === 0) {
    return 0;
  }

  // Serialize messages to JSON for token counting
  const serializedMessages = JSON.stringify(messages);
  return counter.count(serializedMessages);
}

/**
 * Format numbers for display (e.g., 1.2k, 5.1m)
 */
function formatNum(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

/**
 * Calculate percentage for display
 */
function pct(n: number, d: number): string {
  if (d <= 0) return "0.0%";
  return `${((n / d) * 100).toFixed(1)}%`;
}

export function contextCommand({
  terminal,
  tokenCounter,
  modelManager,
  messageHistory,
}: CommandOptions): ReplCommand {
  return {
    command: "/context",
    description: "Show context window usage breakdown",
    getSubCommands: () => Promise.resolve(["--details", "--json"]),
    async execute(args: string[]) {
      const meta = modelManager.getModelMetadata("repl");
      const window = meta.contextWindow;

      // 1) System prompt
      const sys = await systemPrompt({
        supportsToolCalling: meta.supportsToolCalling,
        includeRules: true,
      });
      const systemPromptTokens = tokenCounter.count(sys);

      // 2) Tools (MVP approximation)
      let toolsTokens = 0;
      try {
        const tools = await initCliTools({ tokenCounter });
        const toolDefs = tools.toolDefs;
        const toolNames = JSON.stringify(prepareTools(toolDefs));
        toolsTokens = tokenCounter.count(toolNames);
        // v2: replace with exact serialized definitions
      } catch (error) {
        console.error(error);
        toolsTokens = 0;
      }

      // 3) Messages
      const messagesTokens = countMessageTokens(
        messageHistory.get(),
        tokenCounter,
      );

      // 4) Totals
      const used = systemPromptTokens + toolsTokens + messagesTokens;
      const free = Math.max(0, window - used);

      const breakdown: Breakdown = {
        systemPrompt: systemPromptTokens,
        tools: toolsTokens,
        messages: messagesTokens,
        totalUsed: used,
        window,
        free,
      };

      // Output
      terminal.header("Context Usage");
      terminal.table(
        [
          [
            "System prompt",
            formatNum(breakdown.systemPrompt),
            pct(breakdown.systemPrompt, window),
          ],
          [
            "System tools",
            formatNum(breakdown.tools),
            pct(breakdown.tools, window),
          ],
          [
            "Messages",
            formatNum(breakdown.messages),
            pct(breakdown.messages, window),
          ],
          [
            "Free space",
            formatNum(breakdown.free),
            pct(breakdown.free, window),
          ],
        ],
        { header: ["Section", "Tokens", "Percent"], colWidths: [40, 30, 30] },
      );
      terminal.lineBreak();
      terminal.displayProgressBar(used, window);

      if (args.includes("--json")) {
        terminal.lineBreak();
        terminal.display(JSON.stringify(breakdown, null, 2));
      }

      return "continue";
    },
  };
}
