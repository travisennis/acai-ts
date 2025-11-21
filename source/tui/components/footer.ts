import type { AgentState } from "../../agent/index.ts";
import { formatDuration } from "../../formatting.ts";
import { hr } from "../../terminal/index.ts";
import style, { type StyleInstance } from "../../terminal/style.ts";
import { Container } from "../tui.ts";

/**
 * Footer component that shows pwd, token stats, and context usage
 */
export class FooterComponent extends Container {
  private state: AgentState;

  constructor(state: AgentState) {
    super();
    this.state = state;
  }

  updateState(state: AgentState): void {
    this.state = state;
  }

  override render(width: number): string[] {
    const results: string[] = [];

    if (this.state.steps.length === 0) {
      return results;
    }

    results.push(hr(width));

    // Create a more visual representation of steps/tool usage
    results.push(...displayToolUse(this.state));

    let status = `Steps: ${this.state.steps.length} - `;

    // Show time spend on this prompt
    status += `Time: ${formatDuration(this.state.timestamps.stop - this.state.timestamps.start)} - `;

    const total = this.state.totalUsage;
    const inputTokens = total.inputTokens;
    const outputTokens = total.outputTokens;
    const cachedInputTokens = total.cachedInputTokens;
    const tokenSummary = `Tokens: ↑ ${inputTokens} (${cachedInputTokens}) ↓ ${outputTokens} - `;
    status += tokenSummary;

    const inputCost = this.state.modelConfig.costPerInputToken * inputTokens;
    const outputCost = this.state.modelConfig.costPerOutputToken * outputTokens;
    status += `Cost: $${(inputCost + outputCost).toFixed(2)}`;

    results.push(style.dim(status));

    return results;
    //   // Calculate cumulative usage from all assistant messages
    //   let totalInput = 0;
    //   let totalOutput = 0;
    //   let totalCacheRead = 0;
    //   let totalCacheWrite = 0;
    //   let totalCost = 0;

    //   for (const message of this.state.messages) {
    //     if (message.role === "assistant") {
    //       const assistantMsg = message as AssistantMessage;
    //       totalInput += assistantMsg.usage.input;
    //       totalOutput += assistantMsg.usage.output;
    //       totalCacheRead += assistantMsg.usage.cacheRead;
    //       totalCacheWrite += assistantMsg.usage.cacheWrite;
    //       totalCost += assistantMsg.usage.cost.total;
    //     }
    //   }

    //   // Get last assistant message for context percentage calculation (skip aborted messages)
    //   const lastAssistantMessage = this.state.messages
    //     .slice()
    //     .reverse()
    //     .find((m) => m.role === "assistant" && m.stopReason !== "aborted") as
    //     | AssistantMessage
    //     | undefined;

    //   // Calculate context percentage from last message (input + output + cacheRead + cacheWrite)
    //   const contextTokens = lastAssistantMessage
    //     ? lastAssistantMessage.usage.input +
    //       lastAssistantMessage.usage.output +
    //       lastAssistantMessage.usage.cacheRead +
    //       lastAssistantMessage.usage.cacheWrite
    //     : 0;
    //   const contextWindow = this.state.model.contextWindow;
    //   const contextPercent =
    //     contextWindow > 0
    //       ? ((contextTokens / contextWindow) * 100).toFixed(1)
    //       : "0.0";

    //   // Format token counts (similar to web-ui)
    //   const formatTokens = (count: number): string => {
    //     if (count < 1000) return count.toString();
    //     if (count < 10000) return (count / 1000).toFixed(1) + "k";
    //     return Math.round(count / 1000) + "k";
    //   };

    //   // Replace home directory with ~
    //   let pwd = process.cwd();
    //   const home = process.env.HOME || process.env.USERPROFILE;
    //   if (home && pwd.startsWith(home)) {
    //     pwd = "~" + pwd.slice(home.length);
    //   }

    //   // Truncate path if too long to fit width
    //   const maxPathLength = Math.max(20, width - 10); // Leave some margin
    //   if (pwd.length > maxPathLength) {
    //     const start = pwd.slice(0, Math.floor(maxPathLength / 2) - 2);
    //     const end = pwd.slice(-(Math.floor(maxPathLength / 2) - 1));
    //     pwd = `${start}...${end}`;
    //   }

    //   // Build stats line
    //   const statsParts = [];
    //   if (totalInput) statsParts.push(`↑${formatTokens(totalInput)}`);
    //   if (totalOutput) statsParts.push(`↓${formatTokens(totalOutput)}`);
    //   if (totalCacheRead) statsParts.push(`R${formatTokens(totalCacheRead)}`);
    //   if (totalCacheWrite) statsParts.push(`W${formatTokens(totalCacheWrite)}`);
    //   if (totalCost) statsParts.push(`$${totalCost.toFixed(3)}`);
    //   statsParts.push(`${contextPercent}%`);

    //   const statsLeft = statsParts.join(" ");

    //   // Add model name on the right side
    //   let modelName = this.state.model.id;
    //   const statsLeftWidth = visibleWidth(statsLeft);
    //   const modelWidth = visibleWidth(modelName);

    //   // Calculate available space for padding (minimum 2 spaces between stats and model)
    //   const minPadding = 2;
    //   const totalNeeded = statsLeftWidth + minPadding + modelWidth;

    //   let statsLine: string;
    //   if (totalNeeded <= width) {
    //     // Both fit - add padding to right-align model
    //     const padding = " ".repeat(width - statsLeftWidth - modelWidth);
    //     statsLine = statsLeft + padding + modelName;
    //   } else {
    //     // Need to truncate model name
    //     const availableForModel = width - statsLeftWidth - minPadding;
    //     if (availableForModel > 3) {
    //       // Truncate model name to fit
    //       modelName = modelName.substring(0, availableForModel);
    //       const padding = " ".repeat(
    //         width - statsLeftWidth - visibleWidth(modelName),
    //       );
    //       statsLine = statsLeft + padding + modelName;
    //     } else {
    //       // Not enough space for model name at all
    //       statsLine = statsLeft;
    //     }
    //   }

    //   // Return two lines: pwd and stats
    //   return [chalk.gray(pwd), chalk.gray(statsLine)];
  }
}

// Minimal shape needed from the onFinish result to render tool usage
interface MinimalStep {
  toolResults: Array<{ toolName: string }>;
  toolCalls: Array<{ toolName: string }>;
}

export function displayToolUse(result: { steps: MinimalStep[] }) {
  const toolsCalled: string[] = [];
  const toolColors = new Map<string, StyleInstance>();

  const styleColors = [
    "red",
    "green",
    "yellow",
    "blue",
    "magenta",
    "cyan",
    "white",
    "gray",
    "redBright",
    "greenBright",
    "yellowBright",
    "blueBright",
    "magentaBright",
    "cyanBright",
    "whiteBright",
    "blackBright",
  ] as const;

  const results: string[] = [];

  for (const step of result.steps) {
    let currentToolCalls: Array<{ toolName: string }> = [];

    if (step.toolResults.length > 0) {
      currentToolCalls = step.toolResults;
    } else if (step.toolCalls.length > 0) {
      currentToolCalls = step.toolCalls;
    }

    for (const toolCallOrResult of currentToolCalls) {
      const toolName = toolCallOrResult.toolName;
      if (!toolColors.has(toolName)) {
        const availableColors = styleColors.filter(
          (color) =>
            !Array.from(toolColors.values()).some((c) => c === style[color]),
        );
        const color =
          availableColors.length > 0
            ? (availableColors[
                Math.floor(Math.random() * availableColors.length)
              ] ?? "white")
            : "white";
        toolColors.set(toolName, style[color]);
      }
      toolsCalled.push(toolName);
    }
  }

  if (toolsCalled.length > 0) {
    results.push(style.dim("Tools:"));
    let toolBlocks = "";
    for (const toolCalled of toolsCalled) {
      const colorFn = toolColors.get(toolCalled) ?? style.white;
      toolBlocks += `${colorFn("██")} `;
    }
    results.push(toolBlocks);
    results.push("");

    let toolLegend = "";
    const uniqueTools = new Set(toolsCalled);
    for (const [index, toolCalled] of Array.from(uniqueTools).entries()) {
      const colorFn = toolColors.get(toolCalled) ?? style.white;
      toolLegend += colorFn(toolCalled);
      if (index < new Set(toolsCalled).size - 1) {
        toolLegend += " - ";
      }
    }
    results.push(toolLegend);
    results.push("");
  }

  return results;
}
