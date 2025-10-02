#!/usr/bin/env node
/**
 * Standalone checkbox prompt (inquirer-like)
 * - TypeScript version
 */

import {
  isAbortError,
  isCancelError,
  PromptAbortError,
  PromptCancelError,
} from "./errors.ts";

const Keys = {
  up: "\x1b[A",
  down: "\x1b[B",
  home: "\x1b[H",
  homeAlt: "\x1b[1~",
  end: "\x1b[F",
  endAlt: "\x1b[4~",
  ctrlC: "\u0003",
  enter: "\r",
  newline: "\n",
  backspace: "\x7f",
  backspaceAlt: "\b",
} as const;

const ANSI = {
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  clearLine: "\x1b[2K",
  carriageReturn: "\r",
  moveToStart: "\x1b[0G",
  clearFromCursor: "\x1b[0J",
  moveUp: "\x1b[1A",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
} as const;

interface TerminalIo {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
}

interface ChoiceObject<T = unknown> {
  name: string;
  value: T;
  disabled?: boolean;
  checked?: boolean;
}
export type Choice<T = unknown> = string | ChoiceObject<T>;

interface NormalizedChoice<T = unknown> {
  name: string;
  value: T;
  disabled: boolean;
  checked: boolean;
}

export interface CheckboxOptions<T = unknown> {
  message?: string;
  choices: Choice<T>[];
  initial?: number;
  pageSize?: number;
  loop?: boolean;
  required?: boolean;
  signal?: AbortSignal;
  terminal?: TerminalIo;
}

function normalizeChoice<T>(choice: Choice<T>): NormalizedChoice<T> {
  if (typeof choice === "string") {
    return {
      name: choice,
      value: choice as T,
      disabled: false,
      checked: false,
    };
  }
  const { name, value, disabled = false, checked = false } = choice;
  return { name, value, disabled, checked };
}

function updatePageStart(
  pointerIndex: number,
  pageSize: number,
  totalItems: number,
): number {
  const currentPage = Math.floor(pointerIndex / pageSize);
  const pageStart = currentPage * pageSize;
  return Math.max(0, Math.min(pageStart, Math.max(0, totalItems - pageSize)));
}

function findNextEnabledIndex(
  choices: NormalizedChoice[],
  startIndex: number,
  direction: 1 | -1,
): number {
  const len = choices.length;
  let index = startIndex;

  for (let i = 0; i < len; i++) {
    index = (index + direction + len) % len;
    if (!choices[index].disabled) {
      return index;
    }
  }
  return startIndex;
}

function findFirstEnabledIndex(choices: NormalizedChoice[]): number {
  for (let i = 0; i < choices.length; i++) {
    if (!choices[i].disabled) {
      return i;
    }
  }
  return 0;
}

function findLastEnabledIndex(choices: NormalizedChoice[]): number {
  for (let i = choices.length - 1; i >= 0; i--) {
    if (!choices[i].disabled) {
      return i;
    }
  }
  return choices.length - 1;
}

function render<T>(
  choices: NormalizedChoice<T>[],
  pointerIndex: number,
  pageStart: number,
  pageSize: number,
  prompt: string,
  typed: string,
  requiredError = false,
): string {
  const visible = choices.slice(pageStart, pageStart + pageSize);
  const lines: string[] = [];

  lines.push(`${prompt}${typed ? ` (search: ${typed})` : ""}`);

  if (requiredError) {
    lines.push(`${ANSI.dim}At least one option must be selected${ANSI.reset}`);
  }

  for (let i = 0; i < visible.length; i++) {
    const actualIndex = pageStart + i;
    const ch = visible[i];
    const prefix = actualIndex === pointerIndex ? "›" : " ";
    const checkbox = ch.checked ? "[x]" : "[ ]";

    if (ch.disabled) {
      lines.push(` ${prefix} ${checkbox} ${ch.name} (disabled)`);
    } else if (actualIndex === pointerIndex) {
      lines.push(`${ANSI.cyan} ${prefix} ${checkbox} ${ch.name}${ANSI.reset}`);
    } else {
      lines.push(` ${prefix} ${checkbox} ${ch.name}`);
    }
  }

  if (choices.length > pageSize) {
    const pageCount = Math.ceil(choices.length / pageSize);
    const currentPage = Math.ceil(pageStart / pageSize) + 1;
    lines.push(`${ANSI.dim}Page ${currentPage}/${pageCount}${ANSI.reset}`);
  }

  return lines.join("\n");
}

/**
 * Interactive checkbox prompt for selecting multiple options
 * @param options Configuration options for the checkbox prompt
 * @returns Promise resolving to array of selected values
 * @throws {PromptCancelError} When user cancels with Ctrl+C
 * @throws {PromptAbortError} When signal is aborted
 */
export async function checkbox<T = unknown>({
  message = "Select",
  choices,
  initial = 0,
  pageSize = 7,
  required = false,
  signal,
  terminal = { stdin: process.stdin, stdout: process.stdout },
}: CheckboxOptions<T>): Promise<T[]> {
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("choices must be a non-empty array");
  }

  const normalized = choices.map(normalizeChoice);

  const hasEnabledChoice = normalized.some((ch) => !ch.disabled);
  if (!hasEnabledChoice) {
    throw new Error("At least one choice must be enabled");
  }

  let pointer = Math.max(
    0,
    Math.min(Math.floor(initial ?? 0), normalized.length - 1),
  );

  if (normalized[pointer].disabled) {
    pointer = findNextEnabledIndex(normalized, pointer, 1);
  }

  let pageStart = updatePageStart(pointer, pageSize, normalized.length);

  const { stdin, stdout } = terminal;
  if (!stdin.isTTY) {
    throw new Error("TTY required");
  }

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  let searchBuffer = "";
  let searchTimer: NodeJS.Timeout | null = null;
  let requiredError = false;

  const resetSearchBuffer = () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchBuffer = "";
    }, 800);
  };

  let previousOutputLines = 0;

  function renderToScreen() {
    stdout.write(ANSI.clearLine);
    stdout.write(ANSI.moveToStart);
    stdout.write(ANSI.clearFromCursor);

    // Clear previous output by moving up and clearing lines
    for (let i = 0; i < previousOutputLines; i++) {
      stdout.write(ANSI.moveUp);
      stdout.write(ANSI.clearLine);
    }

    const out = render(
      normalized,
      pointer,
      pageStart,
      pageSize,
      message,
      searchBuffer,
      requiredError,
    );

    // Count lines in current output
    previousOutputLines = out.split("\n").length;

    stdout.write(`${out}\n`);
  }

  function move(delta: 1 | -1) {
    pointer = findNextEnabledIndex(normalized, pointer, delta);
    pageStart = updatePageStart(pointer, pageSize, normalized.length);
    renderToScreen();
  }

  function jumpToIndexStartingWith(prefix: string): boolean {
    const start = (pointer + 1) % normalized.length;
    const lowerPref = prefix.toLowerCase();
    for (let i = 0; i < normalized.length; i++) {
      const idx = (start + i) % normalized.length;
      if (normalized[idx].disabled) continue;
      if (normalized[idx].name.toLowerCase().startsWith(lowerPref)) {
        pointer = idx;
        pageStart = updatePageStart(pointer, pageSize, normalized.length);
        renderToScreen();
        return true;
      }
    }
    return false;
  }

  function toggleCurrent() {
    if (!normalized[pointer].disabled) {
      normalized[pointer].checked = !normalized[pointer].checked;
      renderToScreen();
    }
  }

  function toggleAll() {
    const allChecked = normalized.every((ch) => ch.disabled || ch.checked);
    normalized.forEach((ch) => {
      if (!ch.disabled) {
        ch.checked = !allChecked;
      }
    });
    renderToScreen();
  }

  function invertSelection() {
    normalized.forEach((ch) => {
      if (!ch.disabled) {
        ch.checked = !ch.checked;
      }
    });
    renderToScreen();
  }

  return new Promise<T[]>((resolve, reject) => {
    let resolved = false;
    let cleanupCalled = false;

    function cleanup() {
      if (cleanupCalled) return;
      cleanupCalled = true;
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      if (searchTimer) clearTimeout(searchTimer);
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
      stdout.write(ANSI.showCursor);
    }

    const abortHandler = signal
      ? () => {
          cleanup();
          reject(new PromptAbortError());
        }
      : null;

    if (signal && abortHandler) {
      signal.addEventListener("abort", abortHandler);
    }

    function onData(key: string) {
      if (key === Keys.ctrlC) {
        cleanup();
        stdout.write("\n");
        reject(new PromptCancelError());
        return;
      }

      if (key === Keys.enter || key === Keys.newline) {
        const selected = normalized.filter((ch) => ch.checked && !ch.disabled);
        if (required && selected.length === 0) {
          // Show error but don't exit
          requiredError = true;
          renderToScreen();
          return;
        }
        requiredError = false;
        resolved = true;
        cleanup();
        stdout.write("\n");
        resolve(selected.map((ch) => ch.value));
        return;
      }

      if (key === Keys.up) {
        move(-1);
        return;
      }
      if (key === Keys.down) {
        move(1);
        return;
      }

      if (key === Keys.home || key === Keys.homeAlt) {
        pointer = findFirstEnabledIndex(normalized);
        pageStart = updatePageStart(pointer, pageSize, normalized.length);
        renderToScreen();
        return;
      }
      if (key === Keys.end || key === Keys.endAlt) {
        pointer = findLastEnabledIndex(normalized);
        pageStart = updatePageStart(pointer, pageSize, normalized.length);
        renderToScreen();
        return;
      }

      if (key === Keys.backspace || key === Keys.backspaceAlt) {
        if (searchBuffer.length > 0) {
          searchBuffer = searchBuffer.slice(0, -1);
          if (searchBuffer.length === 0) resetSearchBuffer();
          renderToScreen();
        }
        return;
      }

      if (key === " ") {
        toggleCurrent();
        return;
      }

      if (key === "a") {
        toggleAll();
        return;
      }

      if (key === "i") {
        invertSelection();
        return;
      }

      if (key && key >= " " && key <= "~") {
        searchBuffer += key;
        resetSearchBuffer();
        const found = jumpToIndexStartingWith(searchBuffer);
        if (!found) {
          searchBuffer = key;
          resetSearchBuffer();
          jumpToIndexStartingWith(searchBuffer);
        }
        renderToScreen();
        return;
      }
    }

    try {
      stdout.write(ANSI.hideCursor);
      renderToScreen();
      stdin.on("data", onData);

      const exitHandler = () => {
        if (!resolved) {
          cleanup();
          stdout.write("\n");
        }
      };
      process.on("exit", exitHandler);
    } catch (error) {
      cleanup();
      throw error;
    }
  });
}

// Quick test when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      const res = await checkbox({
        message: "Pick fruits",
        choices: [
          "Apple",
          "Banana",
          { name: "Date", value: "date", checked: true },
          "Elderberry",
          { name: "Fig", value: "fig", disabled: true },
          "Grapes",
          "Honeydew",
          "Orange",
        ],
        pageSize: 3,
        initial: 0,
      });
      console.info("You picked:", res);
      process.exit(0);
    } catch (err) {
      if (isCancelError(err)) {
        console.error("Cancelled");
        process.exit(2);
      } else if (isAbortError(err)) {
        console.error("Aborted");
        process.exit(3);
      } else {
        console.error(err);
        process.exit(1);
      }
    }
  })();
}
