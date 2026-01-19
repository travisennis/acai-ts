import type { LanguageModelUsage } from "ai";
import type { AgentState } from "../../agent/index.ts";
import { formatDuration, formatNumber } from "../../formatting.ts";
import type { ModelManager } from "../../models/manager.ts";
import type { ProjectStatusData } from "../../repl/project-status.ts";
import { getTerminalSize } from "../../terminal/control.ts";
import style from "../../terminal/style.ts";
import { type Component, visibleWidth } from "../tui.ts";
import { ProgressBarComponent } from "./progress-bar.ts";

type State = {
  projectStatus: ProjectStatusData;
  currentContextWindow: number;
  contextWindow: number;
  usage?: LanguageModelUsage;
  agentState?: AgentState;
};

function formatProjectStatus(
  status: ProjectStatusData,
): [string, string | null] {
  const { columns: width } = getTerminalSize();
  const maxPathLength = Math.max(20, width - 10);
  let path = status.path;
  if (path.length > maxPathLength) {
    const start = path.slice(0, Math.floor(maxPathLength / 2) - 2);
    const end = path.slice(-(Math.floor(maxPathLength / 2) - 1));
    path = `${start}...${end}`;
  }

  const line1 = style.blue(path);

  // Line 2: git information
  if (status.isGitRepository && status.branch) {
    let branchDisplay = status.branch;
    if (status.unpushedCommits > 0) {
      branchDisplay += ` ${style.cyan(`↑${status.unpushedCommits}`)}`;
    }

    let fileStatus = "";
    if (status.fileChanges.added) fileStatus += ` +${status.fileChanges.added}`;
    if (status.fileChanges.modified)
      fileStatus += ` ~${status.fileChanges.modified}`;
    if (status.fileChanges.deleted)
      fileStatus += ` -${status.fileChanges.deleted}`;
    if (status.fileChanges.untracked)
      fileStatus += ` ?${status.fileChanges.untracked}`;

    const line2 =
      `${style.gray(branchDisplay)}` +
      `${style.yellow(fileStatus)}` +
      ` ${style.dim("[")}${style.green(`+${status.diffStats.insertions}`)} ${style.red(`-${status.diffStats.deletions}`)}${style.dim("]")}`;

    return [line1, line2];
  }

  return [line1, null];
}

export class FooterComponent implements Component {
  private modelManager: ModelManager;
  private state: State;
  private progressBar: ProgressBarComponent;
  private usage?: LanguageModelUsage;
  private agentState?: AgentState;
  constructor(modelManager: ModelManager, state: State) {
    this.modelManager = modelManager;
    this.agentState = state.agentState;
    this.state = state;
    this.progressBar = new ProgressBarComponent(
      state.currentContextWindow,
      state.contextWindow,
      0,
    );
  }

  setState(state: State) {
    if (state.agentState) {
      this.agentState = state.agentState;
    }
    if (state.usage) {
      this.usage = state.usage;
    }
    this.state = state;
    this.progressBar.setCurrent(state.currentContextWindow);
    this.progressBar.setTotal(state.contextWindow);
  }

  resetState() {
    this.usage = undefined;
    this.agentState = undefined;
  }

  render(width: number): string[] {
    const results: string[] = [];

    const modelInfo = `${this.modelManager.getModelMetadata("repl").id} [${this.modelManager.getModel("repl").modelId}]`;
    const [pathLine, gitLine] = formatProjectStatus(this.state.projectStatus);
    const padding = Math.max(
      0,
      width - visibleWidth(pathLine) - modelInfo.length,
    );
    results.push(pathLine + " ".repeat(padding) + style.dim(modelInfo));

    // Add git information on second line if present
    if (gitLine) {
      results.push(gitLine);
    }

    if (this.usage && this.agentState) {
      const inputTokens = this.usage.inputTokens ?? 0;
      const outputTokens = this.usage.outputTokens ?? 0;
      const cachedInputTokens =
        this.usage.inputTokenDetails.cacheReadTokens ?? 0;
      const tokenSummary = `↑ ${formatNumber(inputTokens)} (${formatNumber(cachedInputTokens)}) ↓ ${formatNumber(outputTokens)} - `;
      let status = tokenSummary;

      const inputCost =
        this.agentState.modelConfig.costPerInputToken * inputTokens;
      const outputCost =
        this.agentState.modelConfig.costPerOutputToken * outputTokens;
      status += `$${(inputCost + outputCost).toFixed(2)}`;

      results.push(style.dim(status));
    }

    if (this.agentState) {
      let status = `Steps: ${this.agentState.steps.length} - `;

      // Calculate total tool calls across all steps
      const totalToolCalls = this.agentState.steps.reduce(
        (total, step) => total + step.toolCalls.length,
        0,
      );
      status += `Tool calls: ${totalToolCalls} - `;

      // Show time spend on this prompt
      status += `${formatDuration(this.agentState.timestamps.stop - this.agentState.timestamps.start)} - `;

      const total = this.agentState.totalUsage;
      const inputTokens = total.inputTokens;
      const outputTokens = total.outputTokens;
      const cachedInputTokens = total.cachedInputTokens;
      const tokenSummary = `↑ ${formatNumber(inputTokens)} (${formatNumber(cachedInputTokens)}) ↓ ${formatNumber(outputTokens)} - `;
      status += tokenSummary;

      const inputCost =
        this.agentState.modelConfig.costPerInputToken * inputTokens;
      const outputCost =
        this.agentState.modelConfig.costPerOutputToken * outputTokens;
      status += `$${(inputCost + outputCost).toFixed(2)}`;

      results.push(style.dim(status));
    }

    // Add progress bar output
    results.push(...this.progressBar.render(width));
    return results;
  }
}
