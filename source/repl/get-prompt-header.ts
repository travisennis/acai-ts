import type { Terminal } from "../terminal/index.ts";
import style from "../terminal/style.ts";
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
    gitStatus = ` ${style.gray(branch + asterisk)}`;
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
      `${style.dim("[")}${style.yellow(fileStatus.trim())} ` +
      `${style.green(`+${stats.insertions}`)} ` +
      `${style.red(`-${stats.deletions}`)}${style.dim("]")}`;
  }

  return `${style.blue(currentDir)}${gitStatus}`;
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
  terminal.writeln(style.dim(modelId));
  terminal.displayProgressBar(currentContextWindow, contextWindow);
}
