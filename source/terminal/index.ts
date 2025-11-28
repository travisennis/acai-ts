/**
 * Terminal Interface Module
 *
 * Provides a user interface for interacting with Claude Code in the terminal.
 * Handles input/output, formatting, and display.
 */

import { config } from "../config.ts";
import { logger } from "../logger.ts";
import { getTerminalSize, link as terminalLink } from "./formatting.ts";
import { applyMarkdown } from "./markdown.ts";
import stripAnsi from "./strip-ansi.ts";
import style, { type StyleInstance } from "./style.ts";
import { Table } from "./table/index.ts";
import wrapAnsi from "./wrap-ansi.ts";

export function getShell() {
  return process.env["ZSH_VERSION"] ? "zsh" : process.env["SHELL"] || "bash";
}

export function isInteractive() {
  return Boolean(process.stdout.isTTY && process.stdin.isTTY);
}

export async function alert(): Promise<void> {
  if (!(await config.readProjectConfig()).notify) {
    return;
  }

  const t = "acai";
  const b = "";
  try {
    process.stdout.write("\x07");
    const esc = "\u001b";
    const bel = "\u0007";
    const safe = (s: string) =>
      s.replaceAll("\u0007", "").replaceAll("\u001b", "");
    const payload = `${esc}]777;notify;${safe(t)};${safe(b)}${bel}`;
    process.stdout.write(payload);
  } catch (err) {
    logger.warn({ err }, "Failed to emit alert");
  }
}

export function hr(width: number) {
  return `${style.gray("─").repeat(width)}`;
}

export function table(
  data: (string | number)[][],
  options: { header?: string[]; colWidths?: number[]; width: number },
): string {
  const { header, colWidths, width } = options;

  // Determine number of columns from data or header
  let colCount = header?.length;
  if (colCount === undefined) {
    colCount = data.length > 0 && data[0] ? data[0].length : 1;
  }

  // Calculate column widths based on terminal width
  const padding = 5; // Account for table borders and padding
  const availableWidth = Math.max(20, width - padding);

  let computedColWidths: number[];

  if (colWidths && colWidths.length === colCount) {
    // Use provided percentages
    computedColWidths = colWidths.map((percent) =>
      Math.max(10, Math.floor((percent / 100) * availableWidth)),
    );
  } else {
    // Distribute width evenly with minimum width per column
    const minColWidth = 15;
    const maxColsThatFit = Math.floor(availableWidth / minColWidth);
    const actualColCount = Math.min(colCount, maxColsThatFit);

    if (actualColCount === 1) {
      computedColWidths = [availableWidth];
    } else {
      // Calculate base width and distribute remaining pixels
      const baseWidth = Math.floor(availableWidth / actualColCount);
      const remainder = availableWidth % actualColCount;
      computedColWidths = Array(actualColCount).fill(baseWidth);

      // Distribute remainder pixels to first few columns
      for (let i = 0; i < remainder && i < actualColCount; i++) {
        computedColWidths[i] = (computedColWidths[i] || 0) + 1;
      }
    }

    // If we have fewer computed widths than columns, extend the array
    while (computedColWidths.length < colCount) {
      computedColWidths.push(minColWidth);
    }
  }

  const table = new Table({
    head: header,
    colWidths: computedColWidths,
    wordWrap: true,
    wrapOnWordBoundary: true,
  });

  // Ensure all data rows have the same number of columns
  const normalizedData = data.map((row) => {
    if (row.length < colCount) {
      // Pad with empty strings if row has fewer columns
      return [...row, ...Array(colCount - row.length).fill("")];
    }
    if (row.length > colCount) {
      // Truncate if row has more columns
      return row.slice(0, colCount);
    }
    return row;
  });

  table.push(...normalizedData);

  return table.toString();
}

export function displayProgressBar(
  current: number,
  total: number,
  width: number,
) {
  const terminalWidth = width;

  // Function to format numbers concisely (e.g., 1.2K, 5M)
  const formatNumber = (num: number): string => {
    if (num < 1000) {
      return num.toString();
    }
    if (num < 1_000_000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    if (num < 1_000_000_000) {
      return `${(num / 1_000_000).toFixed(1)}M`;
    }
    return `${(num / 1_000_000_000).toFixed(1)}G`;
  };

  const currentFormatted = formatNumber(current);
  const totalFormatted = formatNumber(total);
  const progressText = `${currentFormatted}/${totalFormatted}`;
  const progressTextLength = progressText.length + 1; // Add 1 for space

  const progressBarMaxWidth = Math.max(1, terminalWidth - progressTextLength);

  const percentage = total === 0 ? 1 : current / total;
  const filledWidth = Math.max(
    0,
    Math.min(progressBarMaxWidth, Math.floor(percentage * progressBarMaxWidth)),
  );
  const emptyWidth = Math.max(0, progressBarMaxWidth - filledWidth);

  const a =
    filledWidth / progressBarMaxWidth > 0.5
      ? style.red("─")
      : style.yellow("─"); //"█"
  const b = style.gray("─"); // "░"
  const filledBar = a.repeat(filledWidth);
  const emptyBar = b.repeat(emptyWidth);

  // Use \r to move cursor to the beginning of the line for updates
  return `\r${filledBar}${emptyBar} ${progressText}  `;
}

// Standalone terminal formatting functions
export function createHeader(
  header: string,
  styleFn: StyleInstance = style.cyan,
): string {
  const { columns } = getTerminalSize();
  const cols = columns > 0 ? columns : 80;
  const width = Math.max(0, cols - header.length - 4);
  return `${style.gray("\n── ")}${styleFn(header)} ${style.gray("─".repeat(width))}`;
}

export async function createBox(
  header: string,
  content: string,
): Promise<string> {
  const { columns } = getTerminalSize();
  const cols = columns > 0 ? columns : 80;
  const width = Math.max(4, cols - 4);

  const paddedHeader = ` ${header} `;
  const headerVisibleLen = stripAnsi(paddedHeader).length;
  const headerStartPos = 1;

  // Top border with header (use visible header length)
  const leftDashes = headerStartPos;
  const rightDashes = Math.max(0, width - leftDashes - headerVisibleLen);
  const topBorder = `┌${"─".repeat(leftDashes)}${paddedHeader}${"─".repeat(rightDashes)}┐`;

  // Prepare inner content: format markdown first, then wrap to inner width
  const innerWidth = Math.max(1, width - 2);
  const formatted = applyMarkdown(content);
  const wrapped = wrapAnsi(formatted, innerWidth, { trim: false });

  const contentLines = wrapped
    .split("\n")
    .map((line) => {
      const visibleLen = stripAnsi(line).length;
      const padCount = Math.max(0, innerWidth - visibleLen);
      return `│ ${line}${" ".repeat(padCount)} │`;
    })
    .join("\n");

  // Bottom border
  const bottomBorder = `└${"─".repeat(width)}┘`;

  return `${topBorder}\n${contentLines}\n${bottomBorder}`;
}

export function createHr(styleFn: StyleInstance = style.gray): string {
  const { columns } = getTerminalSize();
  const cols = columns > 0 ? columns : 80;
  return styleFn(`${"─".repeat(Math.max(1, cols - 1))} `);
}

export function createLink(text: string, url: string): string {
  return style.underline.blue(terminalLink(text, url));
}

export function formatMarkdown(content: string, wrap = false, width?: number) {
  const formatted = applyMarkdown(content);

  if (wrap) {
    const w = width ?? getTerminalSize().columns;
    return wrapAnsi(formatted, w, { trim: false });
  }

  return formatted;
}

// Re-export the types
export * from "./types.ts";
