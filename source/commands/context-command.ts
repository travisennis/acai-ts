import type { ModelMessage } from "ai";
import { systemPrompt } from "../prompts.ts";
import { getTerminalSize } from "../terminal/formatting.ts";
import { table } from "../terminal/index.ts";
import { initCliTools } from "../tools/index.ts";
import { prepareTools } from "../tools/utils.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Text } from "../tui/index.ts";
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
  workspace,
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
        const tools = await initCliTools({ tokenCounter, workspace });
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
    async handle(
      args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
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
        const tools = await initCliTools({ tokenCounter, workspace });
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

      // Output for TUI
      const { columns } = getTerminalSize();

      container.addChild(new Text("Context Usage", 0, 1));

      const tableData = [
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
        ["Free space", formatNum(breakdown.free), pct(breakdown.free, window)],
      ];

      const tableOutput = table(tableData, {
        header: ["Section", "Tokens", "Percent"],
        colWidths: [40, 30, 30],
        width: columns,
      });

      container.addChild(new Text(tableOutput, 0, 0));

      // Simple progress bar for TUI
      const progressBar = `[${"#".repeat(Math.floor((used / window) * 20))}${"-".repeat(20 - Math.floor((used / window) * 20))}] ${pct(used, window)}`;
      container.addChild(new Text(progressBar, 0, 0));

      if (args.includes("--json")) {
        container.addChild(new Text(JSON.stringify(breakdown, null, 2), 0, 0));
      }

      tui.requestRender();
      editor.setText("");
      return "continue";
    },
  };
}
