/**
 * Terminal Control Module
 *
 * Provides functions for controlling terminal behavior and state.
 */

import { config } from "../config.ts";
import { logger } from "../logger.ts";

// Re-export key functions from keys.ts for convenient imports
export {
  isAltBackspace,
  isAltEnter,
  isAltLeft,
  isAltRight,
  isArrowDown,
  isArrowLeft,
  isArrowRight,
  isArrowUp,
  isBackspace,
  isCtrlA,
  isCtrlC,
  isCtrlD,
  isCtrlE,
  isCtrlG,
  isCtrlK,
  isCtrlL,
  isCtrlP,
  isCtrlT,
  isCtrlU,
  isCtrlW,
  isCtrlZ,
  isDelete,
  isEnd,
  isEnter,
  isEscape,
  isHome,
  isKittyCtrl,
  isKittyKey,
  isNavigationKey,
  isPageDown,
  isPageUp,
  isShiftCtrlD,
  isShiftCtrlO,
  isShiftCtrlP,
  isShiftEnter,
  isShiftTab,
  isTab,
} from "./keys.ts";

/**
 * Get the current shell
 */
export function getShell() {
  return process.env["ZSH_VERSION"] ? "zsh" : process.env["SHELL"] || "bash";
}

/**
 * Check if terminal is interactive
 */
export function isInteractive() {
  return Boolean(process.stdout.isTTY && process.stdin.isTTY);
}

/**
 * Send terminal alert/notification
 */
export async function alert(): Promise<void> {
  if (!(await config.getConfig()).notify) {
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

/**
 * Clear the terminal screen
 */
export function clearScreen(): void {
  // Clear screen and move cursor to top-left
  process.stdout.write("\x1b[2J\x1b[0f");
}

/**
 * Clear the terminal screen including scrollback buffer
 *
 * Unlike clearScreen, this function:
 * 1. Clears the entire screen (\x1b[2J)
 * 2. Clears the scrollback buffer (\x1b[3J)
 * 3. Moves cursor to home position (\x1b[H)
 * 4. Returns a Promise that resolves when the write operation completes
 *
 * @returns Promise that resolves when the terminal has been cleared
 */
export function clearTerminal(): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write("\x1b[2J\x1b[3J\x1b[H", () => {
      resolve();
    });
  });
}

/**
 * Sets the terminal title
 */
export function setTerminalTitle(title: string): void {
  try {
    if (process.platform === "win32") {
      process.title = title ? `✳✳ ${title}` : title;
    } else {
      if (process.stdout.writable) {
        process.stdout.write(`\x1b]0;${title ? `✳✳ ${title}` : ""}\x07`);
      }
    }
  } catch (err) {
    logger.warn({ err }, "Failed to set terminal title");
  }
}

/**
 * Get the terminal size (rows and columns)
 */
export function getTerminalSize(): { rows: number; columns: number } {
  // Default to a reasonable size if we can't determine the actual size
  const defaultSize = { rows: 24, columns: 80 };

  try {
    if (process.stdout.isTTY) {
      return {
        rows: process.stdout.rows || defaultSize.rows,
        columns: process.stdout.columns || defaultSize.columns,
      };
    }
  } catch (_error) {
    // Ignore errors
  }

  return defaultSize;
}

/**
 * Start progress indicator in terminal
 * Sends terminal escape sequence to show progress animation
 */
export function startProgress(): void {
  try {
    if (process.stdout.writable) {
      process.stdout.write("\u001b]9;4;3;0\u0007");
    }
  } catch {
    // Ignore write errors (e.g., EPIPE)
  }
}

/**
 * Stop progress indicator in terminal
 * Sends terminal escape sequence to hide progress animation
 */
export function stopProgress(): void {
  try {
    if (process.stdout.writable) {
      process.stdout.write("\u001b]9;4;0;0\u0007");
    }
  } catch {
    // Ignore write errors (e.g., EPIPE)
  }
}
