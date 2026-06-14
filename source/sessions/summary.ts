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

  const timing = sessionManager.getTimingSummary();
  if (timing && timing.wallClockMs > 0) {
    const toolPct = (timing.toolTimeRatio * 100).toFixed(1);
    lines.push("");
    lines.push("  Timing");
    lines.push(`    Turns:     ${timing.turns}`);
    lines.push(`    Total:     ${formatMs(timing.wallClockMs)}`);
    lines.push(`    Model:     ${formatMs(timing.modelMs)}`);
    lines.push(`    Tools:     ${formatMs(timing.toolMs)}`);
    lines.push(`    Overhead:  ${formatMs(timing.overheadMs)}`);
    lines.push(`    Tool/Total: ${toolPct}%`);
  }

  lines.push("");

  return lines.join("\n");
}

function formatMs(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
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
