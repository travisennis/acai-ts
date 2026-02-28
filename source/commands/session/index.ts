import type { WorkspaceContext } from "../../index.ts";
import type { ModelMetadata } from "../../models/providers.ts";
import { systemPrompt } from "../../prompts/system-prompt.ts";
import { getTerminalSize } from "../../terminal/control.ts";
import { type CompleteToolNames, initTools } from "../../tools/index.ts";
import { prepareTools, toAiSdkTools } from "../../tools/utils.ts";
import type { Editor, TUI } from "../../tui/index.ts";
import {
  Container,
  Modal,
  ModalText,
  TableComponent,
} from "../../tui/index.ts";
import {
  formatDate,
  formatDuration,
  formatNumber,
  formatPercentage,
} from "../../utils/formatting.ts";
import { logger } from "../../utils/logger.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";
import type { Breakdown } from "./types.ts";
import { countMessageTokens } from "./types.ts";

function formatCost(cost: number): string {
  if (cost === 0) return "$0.00";
  if (cost < 0.01) return `$${cost.toFixed(6)}`;
  if (cost < 1) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

async function calculateToolsTokens(
  workspace: WorkspaceContext,
  tokenCounter: { count: (s: string) => number },
): Promise<number> {
  try {
    const tools = await initTools({ workspace });
    const toolDefs = toAiSdkTools(tools);
    const toolNames = JSON.stringify(prepareTools(toolDefs));
    return tokenCounter.count(toolNames);
  } catch (error) {
    logger.info(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to calculate tools tokens",
    );
    return 0;
  }
}

function buildContextTable(breakdown: Breakdown, window: number): string[][] {
  return [
    [
      "System Prompt",
      formatNumber(breakdown.systemPrompt),
      formatPercentage(breakdown.systemPrompt, window),
    ],
    [
      "  Core Instructions",
      formatNumber(breakdown.systemPromptBreakdown.core),
      formatPercentage(breakdown.systemPromptBreakdown.core, window),
    ],
    [
      "  ~/.acai/AGENTS.md",
      formatNumber(breakdown.systemPromptBreakdown.userAgentsMd),
      formatPercentage(breakdown.systemPromptBreakdown.userAgentsMd, window),
    ],
    [
      "  ./AGENTS.md",
      formatNumber(breakdown.systemPromptBreakdown.cwdAgentsMd),
      formatPercentage(breakdown.systemPromptBreakdown.cwdAgentsMd, window),
    ],
    [
      "  Learned Rules",
      formatNumber(breakdown.systemPromptBreakdown.learnedRules),
      formatPercentage(breakdown.systemPromptBreakdown.learnedRules, window),
    ],
    [
      "  Skills",
      formatNumber(breakdown.systemPromptBreakdown.skills),
      formatPercentage(breakdown.systemPromptBreakdown.skills, window),
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
}

function buildTokenTable(
  meta: ModelMetadata,
  inputTokens: number,
  outputTokens: number,
): string[][] {
  const inputCost = (meta.costPerInputToken ?? 0) * inputTokens;
  const outputCost = (meta.costPerOutputToken ?? 0) * outputTokens;
  const totalTokens = inputTokens + outputTokens;
  const totalCost = inputCost + outputCost;

  return [
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
}

export function sessionCommand({
  config,
  tokenCounter,
  modelManager,
  sessionManager,
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
    ): Promise<"continue" | "use"> {
      const meta = modelManager.getModelMetadata("repl");
      const window = meta.contextWindow;

      const projectConfig = await config.getConfig();

      const sysResult = await systemPrompt({
        activeTools: projectConfig.tools.activeTools as
          | CompleteToolNames[]
          | undefined,
        allowedDirs: workspace.allowedDirs,
        logsPath: projectConfig.logs?.path,
        includeRules: true,
      });
      const systemPromptTokens = tokenCounter.count(sysResult.prompt);
      const systemPromptBreakdown = {
        core: tokenCounter.count(sysResult.components.core),
        userAgentsMd: tokenCounter.count(sysResult.components.userAgentsMd),
        cwdAgentsMd: tokenCounter.count(sysResult.components.cwdAgentsMd),
        learnedRules: tokenCounter.count(sysResult.components.learnedRules),
        skills: tokenCounter.count(sysResult.components.skills),
      };

      const toolsTokens = await calculateToolsTokens(workspace, tokenCounter);

      const messages = sessionManager.get();
      const messagesTokens = countMessageTokens(messages, tokenCounter);

      const used = systemPromptTokens + toolsTokens + messagesTokens;
      const free = Math.max(0, window - used);
      const usedPercentage = window > 0 ? (used / window) * 100 : 0;

      const breakdown: Breakdown = {
        systemPrompt: systemPromptTokens,
        systemPromptBreakdown,
        tools: toolsTokens,
        messages: messagesTokens,
        totalUsed: used,
        window,
        free,
      };

      const sessionId = sessionManager.getSessionId();
      const createdAt = sessionManager.getCreatedAt();
      const updatedAt = sessionManager.getUpdatedAt();
      const sessionFile = sessionManager.getSessionFileName();
      const modelId = sessionManager.getModelId() || "Not set";
      const title = sessionManager.getTitle() || "No title";
      const duration = formatDuration(
        updatedAt.getTime() - createdAt.getTime(),
      );

      const messageCount = messages.length;
      const userMessages = messages.filter((m) => m.role === "user").length;
      const assistantMessages = messages.filter(
        (m) => m.role === "assistant",
      ).length;
      const toolMessages = messages.filter((m) => m.role === "tool").length;

      const totalUsage = tokenTracker.getTotalUsage();
      const inputTokens = totalUsage.inputTokens ?? 0;
      const outputTokens = totalUsage.outputTokens ?? 0;

      const usageBreakdown = tokenTracker.getUsageBreakdown();
      const { columns } = getTerminalSize();

      const modalContent = new Container();

      modalContent.addChild(new ModalText("Session Overview", 0, 1));
      modalContent.addChild(new ModalText("─".repeat(columns - 10), 0, 1));

      modalContent.addChild(
        new TableComponent(
          [
            ["Session ID", sessionId],
            ["Session File", sessionFile],
            ["Model", modelId],
            ["Title", title],
            ["Duration", duration],
            ["Started", formatDate(createdAt)],
            ["Last Updated", formatDate(updatedAt)],
          ],
          { headers: ["Property", "Value"], colWidths: [25, 75] },
        ),
      );

      modalContent.addChild(new ModalText("", 0, 1));
      modalContent.addChild(new ModalText("Message Statistics", 0, 1));
      modalContent.addChild(
        new TableComponent(
          [
            ["Total Messages", String(messageCount)],
            ["User Messages", String(userMessages)],
            ["Assistant Messages", String(assistantMessages)],
            ["Tool Messages", String(toolMessages)],
          ],
          { headers: ["Type", "Count"] },
        ),
      );

      modalContent.addChild(new ModalText("", 0, 1));
      modalContent.addChild(new ModalText("Context Usage", 0, 1));
      modalContent.addChild(
        new TableComponent(buildContextTable(breakdown, window), {
          headers: ["Section", "Tokens", "Percent"],
        }),
      );

      const barWidth = Math.max(20, Math.min(50, columns - 40));
      const filled = Math.min(
        barWidth,
        Math.floor((usedPercentage / 100) * barWidth),
      );
      const empty = barWidth - filled;
      const progressBar = `[${"█".repeat(filled)}${"░".repeat(empty)}] ${usedPercentage.toFixed(1)}%`;
      modalContent.addChild(new ModalText("", 0, 1));
      modalContent.addChild(new ModalText(progressBar, 0, 1));

      modalContent.addChild(new ModalText("", 0, 1));
      modalContent.addChild(new ModalText("Token Usage & Costs", 0, 1));
      modalContent.addChild(
        new TableComponent(buildTokenTable(meta, inputTokens, outputTokens), {
          headers: ["Type", "Tokens", "Cost", "Rate"],
        }),
      );

      modalContent.addChild(new ModalText("", 0, 1));

      if (Object.keys(usageBreakdown).length > 0) {
        modalContent.addChild(new ModalText("Usage by Application", 0, 1));
        const usageTable = Object.entries(usageBreakdown).map(
          ([app, tokens]) => [app, formatNumber(tokens)],
        );
        modalContent.addChild(
          new TableComponent(usageTable, {
            headers: ["Application", "Tokens"],
          }),
        );
      } else {
        modalContent.addChild(new ModalText("No usage data available", 0, 1));
      }

      const modal = new Modal("Session Information", modalContent, true, () => {
        editor.setText("");
        tui.requestRender();
      });

      tui.showModal(modal);
      return "continue";
    },
  };
}
