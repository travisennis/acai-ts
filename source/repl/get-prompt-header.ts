import chalk from "../terminal/chalk.ts";
import type { Terminal } from "../terminal/index.ts";
import {
  getCurrentBranch,
  getDiffStat,
  getGitStatus,
  hasUncommittedChanges,
  inGitDirectory,
} from "../tools/git-utils.ts";

async function getProjectStatusLine(): Promise<string> {
  const currentDir = process.cwd().split("/").pop() || process.cwd();
  const branch = await getCurrentBranch();

  let gitStatus = "";
  if (branch) {
    const hasChanges = await hasUncommittedChanges();
    const asterisk = hasChanges ? "*" : "";
    gitStatus = ` ${chalk.gray(branch + asterisk)}`;
  }

  if (await inGitDirectory()) {
    const stats = await getDiffStat();
    const fileChanges = await getGitStatus();
    let fileStatus = "";
    if (fileChanges.added) fileStatus += ` +${fileChanges.added}`;
    if (fileChanges.modified) fileStatus += ` ~${fileChanges.modified}`;
    if (fileChanges.deleted) fileStatus += ` -${fileChanges.deleted}`;
    if (fileChanges.untracked) fileStatus += ` ?${fileChanges.untracked}`;
    gitStatus +=
      " " +
      `${chalk.dim("[")}${chalk.yellow(fileStatus.trim())} ` +
      `${chalk.green(`+${stats.insertions}`)} ` +
      `${chalk.red(`-${stats.deletions}`)}${chalk.dim("]")}`;
  }

  return `${chalk.blue(currentDir)}${gitStatus}`;
}

export async function getPromptHeader(args: {
  terminal: Terminal;
  modelId: string;
  contextWindow: number;
  currentContextWindow: number;
}): Promise<void> {
  const { terminal, modelId, contextWindow, currentContextWindow } = args;
  terminal.hr();
  terminal.writeln(await getProjectStatusLine());
  terminal.writeln(chalk.dim(modelId));
  terminal.displayProgressBar(currentContextWindow, contextWindow);
}
