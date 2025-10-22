#!/usr/bin/env node
/**
 * Standalone search prompt (inquirer-like)
 * - TypeScript version
 */

// ANSI helpers
const ESC = "\x1b[";
const hideCursor = () => process.stdout.write(`${ESC}?25l`);
const showCursor = () => process.stdout.write(`${ESC}?25h`);
// const clearLine = () => process.stdout.write("\x1b[2K\r");

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

export interface SearchOptions<T = unknown> {
  message?: string;
  source: (input: string) => Promise<Choice<T>[]>;
  pageSize?: number;
  signal?: AbortSignal;
}

function normalizeChoice<T>(choice: Choice<T>): NormalizedChoice<T> {
  if (typeof choice === "string") {
    return { name: choice, value: choice as T, disabled: false };
  }
  const { name, value, disabled = false } = choice;
  return { name, value, disabled };
}

function render<T>(
  choices: NormalizedChoice<T>[],
  pointerIndex: number,
  pageStart: number,
  pageSize: number,
  prompt: string,
  searchInput: string,
): string {
  const visible = choices.slice(pageStart, pageStart + pageSize);
  const lines: string[] = [];

  lines.push(`${prompt}${searchInput ? ` (search: ${searchInput})` : ""}`);

  for (let i = 0; i < visible.length; i++) {
    const actualIndex = pageStart + i;
    const ch = visible[i];
    const prefix = actualIndex === pointerIndex ? "›" : " ";

    if (ch.disabled) {
      lines.push(` ${prefix} ${ch.name} (disabled)`);
    } else if (actualIndex === pointerIndex) {
      lines.push(`\x1b[36m ${prefix} ${ch.name}\x1b[0m`);
    } else {
      lines.push(` ${prefix} ${ch.name}`);
    }
  }

  if (choices.length > pageSize) {
    const pageCount = Math.ceil(choices.length / pageSize);
    const currentPage = Math.ceil(pageStart / pageSize) + 1;
    lines.push(`\x1b[2mPage ${currentPage}/${pageCount}\x1b[0m`);
  }

  return lines.join("\n");
}

export async function search<T = unknown>({
  message = "Search",
  source,
  pageSize = 7,
  signal,
}: SearchOptions<T>): Promise<T> {
  const stdin = process.stdin;
  const stdout = process.stdout;
  if (!stdin.isTTY) throw new Error("TTY required");

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  let searchInput = "";
  let choices: NormalizedChoice<T>[] = [];
  let pointer = 0;
  let pageStart = 0;
  let lastSourceCall: Promise<void> | null = null;

  let previousOutputLines = 0;

  function clearPreviousOutput(lineCount: number) {
    for (let i = 0; i < lineCount; i++) {
      stdout.write("\x1b[1A\x1b[2K"); // Move up and clear line
    }
  }

  function renderToScreen() {
    stdout.write("\x1b[2K"); // Clear current line
    stdout.write("\x1b[0G"); // Move to start of line
    stdout.write("\x1b[0J"); // Clear from cursor to end of screen

    clearPreviousOutput(previousOutputLines);

    const out = render(
      choices,
      pointer,
      pageStart,
      pageSize,
      message,
      searchInput,
    );

    // Count lines in current output
    previousOutputLines = out.split("\n").length;

    stdout.write(`${out}\n`);
  }

  function move(delta: number) {
    const len = choices.length;
    if (len === 0) return;

    let newIndex = pointer;
    do {
      newIndex = (newIndex + delta + len) % len;
    } while (choices[newIndex]?.disabled && newIndex !== pointer);
    pointer = newIndex;

    // Update pageStart to snap to page boundaries
    const currentPage = Math.floor(pointer / pageSize);
    pageStart = currentPage * pageSize;

    // Ensure pageStart is within bounds
    pageStart = Math.max(0, Math.min(pageStart, choices.length - pageSize));

    renderToScreen();
  }

  async function updateChoices(input: string) {
    // Cancel previous source call if still in progress
    if (lastSourceCall) {
      // We can't actually cancel the promise, but we can ignore its result
      lastSourceCall.catch(() => {});
    }

    const sourcePromise = source(input);
    lastSourceCall = sourcePromise.then(() => {});

    try {
      const newChoices = await sourcePromise;
      choices = newChoices.map(normalizeChoice);

      // Reset pointer to first selectable choice
      pointer = 0;
      if (choices.length > 0) {
        for (let i = 0; i < choices.length; i++) {
          if (!choices[i].disabled) {
            pointer = i;
            break;
          }
        }
      }

      pageStart = 0;
      renderToScreen();
    } catch (_error) {
      // Handle source errors gracefully
      choices = [];
      pointer = 0;
      pageStart = 0;
      renderToScreen();
    }
  }

  return new Promise<T>((resolve, reject) => {
    let resolved = false;

    function cleanup() {
      if (resolved) return;
      resolved = true;
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      showCursor();
    }

    // Handle abort signal
    if (signal) {
      signal.addEventListener("abort", () => {
        cleanup();
        const err = new Error("AbortError") as Error & { name?: string };
        err.name = "AbortError";
        reject(err);
      });
    }

    function onData(key: string) {
      if (key === "\u0003") {
        cleanup();
        stdout.write("\n");
        const err = new Error("Cancelled") as Error & { isCanceled?: boolean };
        err.isCanceled = true;
        reject(err);
        return;
      }

      if (key === "\r" || key === "\n") {
        if (choices.length === 0) {
          // No choices available, just return
          cleanup();
          stdout.write("\n");
          const err = new Error("No choices available") as Error & {
            isCanceled?: boolean;
          };
          err.isCanceled = true;
          reject(err);
          return;
        }

        const chosen = choices[pointer];
        if (chosen && !chosen.disabled) {
          cleanup();
          stdout.write("\n");
          resolve(chosen.value);
          return;
        }
        return;
      }

      if (key === "\x1b[A") {
        move(-1);
        return;
      }
      if (key === "\x1b[B") {
        move(1);
        return;
      }

      if (key === "\x1b[H" || key === "\x1b[1~") {
        if (choices.length > 0) {
          for (let i = 0; i < choices.length; i++) {
            if (!choices[i].disabled) {
              pointer = i;
              break;
            }
          }
          // Update pageStart to snap to page boundaries
          const currentPage = Math.floor(pointer / pageSize);
          pageStart = currentPage * pageSize;
          pageStart = Math.max(
            0,
            Math.min(pageStart, choices.length - pageSize),
          );
          renderToScreen();
        }
        return;
      }
      if (key === "\x1b[F" || key === "\x1b[4~") {
        if (choices.length > 0) {
          for (let i = choices.length - 1; i >= 0; i--) {
            if (!choices[i].disabled) {
              pointer = i;
              break;
            }
          }
          // Update pageStart to snap to page boundaries
          const currentPage = Math.floor(pointer / pageSize);
          pageStart = currentPage * pageSize;
          pageStart = Math.max(
            0,
            Math.min(pageStart, choices.length - pageSize),
          );
          renderToScreen();
        }
        return;
      }

      if (key === "\x7f" || key === "\b") {
        if (searchInput.length > 0) {
          searchInput = searchInput.slice(0, -1);
          updateChoices(searchInput);
        }
        return;
      }

      if (key && key >= " " && key <= "~") {
        searchInput += key;
        updateChoices(searchInput);
        return;
      }
    }

    hideCursor();
    // Reset previous output lines counter to ensure clean start
    previousOutputLines = 0;
    // Initial render with empty search
    updateChoices("");
    stdin.on("data", onData);

    process.on("exit", () => {
      if (!resolved) {
        cleanup();
        stdout.write("\n");
      }
    });
  });
}

// Quick test when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      const res = await search({
        message: "Search for fruit",
        source: async (input) => {
          // Simulate async search
          await new Promise((resolve) => setTimeout(resolve, 100));

          const fruits = [
            "Apple",
            "Banana",
            "Cherry",
            "Date",
            "Elderberry",
            "Fig",
            "Grapes",
            "Honeydew",
            "Orange",
          ];

          if (!input) {
            return fruits.slice(0, 5);
          }

          return fruits
            .filter((fruit) =>
              fruit.toLowerCase().includes(input.toLowerCase()),
            )
            .slice(0, 10);
        },
        pageSize: 5,
      });
      console.log("You selected:", res);
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
