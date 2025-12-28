import type { ModelMessage } from "ai";
import {
  formatDate,
  formatDuration,
  formatNumber,
  formatPercentage,
} from "../formatting.ts";
import { logger } from "../logger.ts";
import { systemPrompt } from "../prompts.ts";
import { getTerminalSize } from "../terminal/control.ts";
import { type CompleteToolNames, initCliTools } from "../tools/index.ts";
import { prepareTools } from "../tools/utils.ts";
import type { Editor, TUI } from "../tui/index.ts";
import { Container, Modal, ModalText, TableComponent } from "../tui/index.ts";
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

export function sessionCommand({
  config,
  tokenCounter,
  modelManager,
  sessionManager: messageHistory,
  workspace,
  tokenTracker,
}: CommandOptions): ReplCommand {
  return {
    command: "/session",
    description:
      "Show comprehensive session information including usage, context, and costs",
    getSubCommands: () => Promise.resolve([]),
    async handle(
      _args: string[],
      { tui, editor }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      // Get model metadata for context window and costs
      const meta = modelManager.getModelMetadata("repl");
      const window = meta.contextWindow;

      const projectConfig = await config.getConfig();

      // 1) System prompt tokens
      const sys = await systemPrompt({
        activeTools: projectConfig.tools.activeTools as
          | CompleteToolNames[]
          | undefined,
        allowedDirs: workspace.allowedDirs,
        includeRules: true,
      });
      const systemPromptTokens = tokenCounter.count(sys);

      // 2) Tools tokens
      let toolsTokens = 0;
      try {
        const tools = await initCliTools({
          workspace,
        });
        const toolDefs = tools.toolDefs;
        const toolNames = JSON.stringify(prepareTools(toolDefs));
        toolsTokens = tokenCounter.count(toolNames);
      } catch (error) {
        logger.info(
          { error: error instanceof Error ? error.message : String(error) },
          "Failed to calculate tools tokens",
        );
        toolsTokens = 0;
      }

      // 3) Messages tokens
      const messages = messageHistory.get();
      const messagesTokens = countMessageTokens(messages, tokenCounter);

      // 4) Context totals
      const used = systemPromptTokens + toolsTokens + messagesTokens;
      const free = Math.max(0, window - used);
      const usedPercentage = window > 0 ? (used / window) * 100 : 0;

      const breakdown: Breakdown = {
        systemPrompt: systemPromptTokens,
        tools: toolsTokens,
        messages: messagesTokens,
        totalUsed: used,
        window,
        free,
      };

      // 5) Session metadata
      const sessionId = messageHistory.getSessionId();
      const sessionFile = `message-history-${sessionId}.json`;
      const modelId = messageHistory.getModelId() || "Not set";
      const title = messageHistory.getTitle() || "No title";
      const createdAt = messageHistory.getCreatedAt();
      const updatedAt = messageHistory.getUpdatedAt();
      const duration = formatDuration(
        updatedAt.getTime() - createdAt.getTime(),
      );

      // 6) Message statistics
      const messageCount = messages.length;
      const userMessages = messages.filter((m) => m.role === "user").length;
      const assistantMessages = messages.filter(
        (m) => m.role === "assistant",
      ).length;
      const toolMessages = messages.filter((m) => m.role === "tool").length;

      // 7) Token usage and costs
      const totalUsage = tokenTracker.getTotalUsage();
      const inputTokens = totalUsage.inputTokens ?? 0;
      const outputTokens = totalUsage.outputTokens ?? 0;
      const totalTokens = inputTokens + outputTokens;

      // Calculate costs using model metadata
      const inputCost = (meta.costPerInputToken ?? 0) * inputTokens;
      const outputCost = (meta.costPerOutputToken ?? 0) * outputTokens;
      const totalCost = inputCost + outputCost;

      // 8) Usage breakdown by app
      const usageBreakdown = tokenTracker.getUsageBreakdown();

      const { columns } = getTerminalSize();

      // Build modal content
      const modalContent = new Container();

      // Session metadata section
      modalContent.addChild(new ModalText("Session Overview", 0, 1));
      modalContent.addChild(new ModalText("─".repeat(columns - 10), 0, 1));

      const metadataTable = [
        ["Session ID", sessionId],
        ["Session File", sessionFile],
        ["Model", modelId],
        ["Title", title],
        ["Duration", duration],
        ["Started", formatDate(createdAt)],
        ["Last Updated", formatDate(updatedAt)],
      ];
      modalContent.addChild(
        new TableComponent(metadataTable, {
          headers: ["Property", "Value"],
          colWidths: [25, 75],
        }),
      );

      modalContent.addChild(new ModalText("", 0, 1)); // Spacer

      // Message statistics
      modalContent.addChild(new ModalText("Message Statistics", 0, 1));
      const messageStatsTable = [
        ["Total Messages", String(messageCount)],
        ["User Messages", String(userMessages)],
        ["Assistant Messages", String(assistantMessages)],
        ["Tool Messages", String(toolMessages)],
      ];
      modalContent.addChild(
        new TableComponent(messageStatsTable, {
          headers: ["Type", "Count"],
        }),
      );

      modalContent.addChild(new ModalText("", 0, 1)); // Spacer

      // Context usage with progress bar
      modalContent.addChild(new ModalText("Context Usage", 0, 1));
      const contextTable = [
        [
          "System Prompt",
          formatNumber(breakdown.systemPrompt),
          formatPercentage(breakdown.systemPrompt, window),
        ],
        [
          "System Tools",
          formatNumber(breakdown.tools),
          formatPercentage(breakdown.tools, window),
        ],
        [
          "Messages",
          formatNumber(breakdown.messages),
          formatPercentage(breakdown.messages, window),
        ],
        [
          "Free Space",
          formatNumber(breakdown.free),
          formatPercentage(breakdown.free, window),
        ],
        [
          "Total Used",
          formatNumber(breakdown.totalUsed),
          formatPercentage(breakdown.totalUsed, window),
        ],
        ["Context Window", formatNumber(window), "100%"],
      ];
      modalContent.addChild(
        new TableComponent(contextTable, {
          headers: ["Section", "Tokens", "Percent"],
        }),
      );

      // Progress bar
      const barWidth = Math.max(20, Math.min(50, columns - 40)); // Responsive width
      const filled = Math.floor((usedPercentage / 100) * barWidth);
      const empty = barWidth - filled;
      const progressBar = `[${"█".repeat(filled)}${"░".repeat(empty)}] ${usedPercentage.toFixed(1)}%`;
      modalContent.addChild(new ModalText("", 0, 1)); // Spacer
      modalContent.addChild(new ModalText(progressBar, 0, 1));

      modalContent.addChild(new ModalText("", 0, 1)); // Spacer

      // Token usage and costs
      modalContent.addChild(new ModalText("Token Usage & Costs", 0, 1));

      // Format costs appropriately
      const formatCost = (cost: number): string => {
        if (cost === 0) return "$0.00";
        if (cost < 0.01) return `$${cost.toFixed(6)}`;
        if (cost < 1) return `$${cost.toFixed(4)}`;
        return `$${cost.toFixed(2)}`;
      };

      const tokenTable = [
        [
          "Input Tokens",
          formatNumber(inputTokens),
          formatCost(inputCost),
          meta.costPerInputToken
            ? `$${meta.costPerInputToken.toFixed(6)}/token`
            : "N/A",
        ],
        [
          "Output Tokens",
          formatNumber(outputTokens),
          formatCost(outputCost),
          meta.costPerOutputToken
            ? `$${meta.costPerOutputToken.toFixed(6)}/token`
            : "N/A",
        ],
        ["Total Tokens", formatNumber(totalTokens), formatCost(totalCost), ""],
      ];
      modalContent.addChild(
        new TableComponent(tokenTable, {
          headers: ["Type", "Tokens", "Cost", "Rate"],
        }),
      );

      modalContent.addChild(new ModalText("", 0, 1)); // Spacer

      // Usage breakdown by app
      if (Object.keys(usageBreakdown).length > 0) {
        modalContent.addChild(new ModalText("Usage by Application", 0, 1));
        const usageEntries = Object.entries(usageBreakdown);
        const usageTable = usageEntries.map(([app, tokens]) => [
          app,
          formatNumber(tokens),
        ]);
        modalContent.addChild(
          new TableComponent(usageTable, {
            headers: ["Application", "Tokens"],
          }),
        );
      } else {
        modalContent.addChild(new ModalText("No usage data available", 0, 1));
      }

      // Create and show modal
      const modal = new Modal("Session Information", modalContent, true, () => {
        // Modal closed callback
        editor.setText("");
        tui.requestRender();
      });

      tui.showModal(modal);
      return "continue";
    },
  };
}
