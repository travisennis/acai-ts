import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionManager } from "./manager.ts";

function formatSummary(sessionManager: SessionManager): string {
  const sessionId = sessionManager.getSessionId();
  const title = sessionManager.getTitle();
  const filePath = sessionManager.getSessionFilePath();

  const lines = [
    "",
    "Session Summary",
    `  ID:      ${sessionId}`,
    ...(title ? [`  Title:   ${title}`] : []),
    `  File:    ${filePath}`,
    `  Resume:  acai --resume ${sessionId}`,
    "",
  ];

  return lines.join("\n");
}

export function writeExitSummary(sessionManager: SessionManager): void {
  const summary = formatSummary(sessionManager);
  const summaryPath = join(tmpdir(), "acai-exit-summary.txt");
  writeFileSync(summaryPath, summary, "utf-8");
}

export function printExitSummary(sessionManager: SessionManager): void {
  const summary = formatSummary(sessionManager);
  process.stderr.write(summary);
}
