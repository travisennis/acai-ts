import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionManager } from "./manager.ts";

function formatSummary(
  sessionManager: SessionManager,
  noSession?: boolean,
): string {
  const sessionId = sessionManager.getSessionId();
  const title = sessionManager.getTitle();

  const lines: string[] = [
    "",
    "Session Summary",
    `  ID:      ${sessionId}`,
    ...(title ? [`  Title:   ${title}`] : []),
  ];

  // Only show file path and resume command if session is being saved
  if (!noSession) {
    const filePath = sessionManager.getSessionFilePath();
    lines.push(`  File:    ${filePath}`);
    lines.push(`  Resume:  acai --resume ${sessionId}`);
  }

  lines.push("");

  return lines.join("\n");
}

export function writeExitSummary(
  sessionManager: SessionManager,
  noSession?: boolean,
): void {
  const summary = formatSummary(sessionManager, noSession);
  const summaryPath = join(tmpdir(), "acai-exit-summary.txt");
  writeFileSync(summaryPath, summary, "utf-8");
}

export function printExitSummary(
  sessionManager: SessionManager,
  noSession?: boolean,
): void {
  const summary = formatSummary(sessionManager, noSession);
  process.stderr.write(summary);
}
