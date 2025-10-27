#!/usr/bin/env node
/**
 * Standalone select prompt (inquirer-like)
 * - TypeScript version
 */

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

interface ChoiceObject<T = unknown> {
  name: string;
  value: T;
  disabled?: boolean;
}
export type Choice<T = unknown> = string | ChoiceObject<T>;

interface NormalizedChoice<T = unknown> {
  name: string;
  value: T;
  disabled: boolean;
}

interface TerminalIo {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
}

export interface SelectOptions<T = unknown> {
  message?: string;
  choices: Choice<T>[];
  initial?: number;
  pageSize?: number;
  signal?: AbortSignal;
  terminal?: TerminalIo;
}

function normalizeChoice<T>(choice: Choice<T>): NormalizedChoice<T> {
  if (typeof choice === "string") {
    return { name: choice, value: choice as T, disabled: false };
  }
  const { name, value, disabled = false } = choice;
  return { name, value, disabled };
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
  totalChoices: number,
): string {
  const visible = choices.slice(pageStart, pageStart + pageSize);
  const lines: string[] = [];

  const searchInfo = typed ? ` (search: ${typed})` : "";
  const filterInfo =
    typed && choices.length !== totalChoices
      ? ` [${choices.length}/${totalChoices}]`
      : "";
  lines.push(`${prompt}${searchInfo}${filterInfo}`);

  for (let i = 0; i < visible.length; i++) {
    const actualIndex = pageStart + i;
    const ch = visible[i];
    const prefix = actualIndex === pointerIndex ? "›" : " ";
    if (ch.disabled) {
      lines.push(` ${prefix} ${ch.name} (disabled)`);
    } else if (actualIndex === pointerIndex) {
      lines.push(`${ANSI.cyan} ${prefix} ${ch.name}${ANSI.reset}`);
    } else {
      lines.push(` ${prefix} ${ch.name}`);
    }
  }

  if (choices.length > pageSize) {
    const pageCount = Math.ceil(choices.length / pageSize);
    const currentPage = Math.ceil(pageStart / pageSize) + 1;
    lines.push(`${ANSI.dim}Page ${currentPage}/${pageCount}${ANSI.reset}`);
  }

  return lines.join("\n");
}

export async function select<T = unknown>({
  message = "Select",
  choices,
  initial = 0,
  pageSize = 7,
  signal,
  terminal = { stdin: process.stdin, stdout: process.stdout },
}: SelectOptions<T>): Promise<T> {
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
  if (!stdin.isTTY) throw new Error("TTY required");

  let searchBuffer = "";
  const searchTimer: NodeJS.Timeout | null = null;
  let filteredChoices: NormalizedChoice<T>[] = [...normalized];

  const clearSearchBuffer = () => {
    searchBuffer = "";
    filteredChoices = [...normalized];
    // Reset pointer to first enabled choice when clearing search
    pointer = findFirstEnabledIndex(filteredChoices);
    pageStart = updatePageStart(pointer, pageSize, filteredChoices.length);
    renderToScreen();
  };

  const resetSearchTimer = () => {
    if (searchTimer) clearTimeout(searchTimer);
    // Don't auto-clear the search buffer - let user clear it explicitly
  };

  let previousOutputLines = 0;

  function clearPreviousOutput(lineCount: number) {
    for (let i = 0; i < lineCount; i++) {
      stdout.write(`${ANSI.moveUp}${ANSI.clearLine}`);
    }
  }

  function renderToScreen() {
    stdout.write(ANSI.clearLine);
    stdout.write(ANSI.moveToStart);
    stdout.write(ANSI.clearFromCursor);

    clearPreviousOutput(previousOutputLines);

    const out = render(
      filteredChoices,
      pointer,
      pageStart,
      pageSize,
      message,
      searchBuffer,
      normalized.length,
    );

    previousOutputLines = out.split("\n").length;

    stdout.write(`${out}\n`);
  }

  function move(delta: 1 | -1) {
    pointer = findNextEnabledIndex(filteredChoices, pointer, delta);
    pageStart = updatePageStart(pointer, pageSize, filteredChoices.length);
    renderToScreen();
  }

  function filterChoices(search: string): void {
    if (!search) {
      filteredChoices = [...normalized];
    } else {
      const lowerSearch = search.toLowerCase();
      filteredChoices = normalized.filter((choice) =>
        choice.name.toLowerCase().includes(lowerSearch),
      );
    }

    // Reset pointer to first enabled choice
    pointer = findFirstEnabledIndex(filteredChoices);
    pageStart = updatePageStart(pointer, pageSize, filteredChoices.length);
  }

  return new Promise<T>((resolve, reject) => {
    let resolved = false;

    function cleanup() {
      if (resolved) return;
      resolved = true;
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
          const err = new Error("AbortError") as Error & { name?: string };
          err.name = "AbortError";
          reject(err);
        }
      : null;

    if (signal && abortHandler) {
      signal.addEventListener("abort", abortHandler);
    }

    function onData(key: string) {
      if (key === Keys.ctrlC) {
        cleanup();
        stdout.write("\n");
        const err = new Error("Cancelled") as Error & { isCanceled?: boolean };
        err.isCanceled = true;
        reject(err);
        return;
      }

      if (key === Keys.enter || key === Keys.newline) {
        cleanup();
        const chosen = filteredChoices[pointer];
        stdout.write("\n");
        resolve(chosen.value);
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
        pointer = findFirstEnabledIndex(filteredChoices);
        pageStart = updatePageStart(pointer, pageSize, filteredChoices.length);
        renderToScreen();
        return;
      }
      if (key === Keys.end || key === Keys.endAlt) {
        pointer = findLastEnabledIndex(filteredChoices);
        pageStart = updatePageStart(pointer, pageSize, filteredChoices.length);
        renderToScreen();
        return;
      }

      if (key === Keys.backspace || key === Keys.backspaceAlt) {
        if (searchBuffer.length > 0) {
          searchBuffer = searchBuffer.slice(0, -1);
          if (searchBuffer.length === 0) {
            clearSearchBuffer();
          } else {
            filterChoices(searchBuffer);
            renderToScreen();
          }
        }
        return;
      }

      if (key && key >= " " && key <= "~") {
        searchBuffer += key;
        resetSearchTimer();
        filterChoices(searchBuffer);
        renderToScreen();
        return;
      }
    }

    try {
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding("utf8");
      stdout.write(ANSI.hideCursor);
      // Reset previous output lines counter to ensure clean start
      previousOutputLines = 0;
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

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      const res = await select({
        message: "Pick a fruit",
        choices: [
          "Apple",
          "Banana",
          "Date",
          "Elderberry",
          "Fig",
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
      if (
        err &&
        typeof err === "object" &&
        "isCanceled" in err &&
        err.isCanceled
      ) {
        console.error("Canceled");
        process.exit(2);
      } else {
        console.error(err);
        process.exit(1);
      }
    }
  })();
}
