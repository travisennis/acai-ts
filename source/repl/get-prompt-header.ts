import type { Terminal } from "../terminal/index.ts";
import style from "../terminal/style.ts";
import { getProjectStatusLine } from "./project-status-line.ts";

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
