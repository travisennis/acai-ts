#!/usr/bin/env node
/**
 * Standalone checkbox prompt (inquirer-like)
 * - TypeScript version
 */

// ANSI helpers
const ESC = "\x1b[";
const hideCursor = () => process.stdout.write(`${ESC}?25l`);
const showCursor = () => process.stdout.write(`${ESC}?25h`);
const clearLine = () => process.stdout.write("\x1b[2K\r");

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

function render<T>(
  choices: NormalizedChoice<T>[],
  pointerIndex: number,
  pageStart: number,
  pageSize: number,
  prompt: string,
  typed: string,
): string {
  const visible = choices.slice(pageStart, pageStart + pageSize);
  const lines: string[] = [];

  lines.push(`${prompt}${typed ? ` (search: ${typed})` : ""}`);

  for (let i = 0; i < visible.length; i++) {
    const actualIndex = pageStart + i;
    const ch = visible[i];
    const prefix = actualIndex === pointerIndex ? "›" : " ";
    const checkbox = ch.checked ? "[x]" : "[ ]";

    if (ch.disabled) {
      lines.push(` ${prefix} ${checkbox} ${ch.name} (disabled)`);
    } else if (actualIndex === pointerIndex) {
      lines.push(`\x1b[36m ${prefix} ${checkbox} ${ch.name}\x1b[0m`);
    } else {
      lines.push(` ${prefix} ${checkbox} ${ch.name}`);
    }
  }

  if (choices.length > pageSize) {
    const pageCount = Math.ceil(choices.length / pageSize);
    const currentPage = Math.ceil(pageStart / pageSize) + 1;
    lines.push(`\x1b[2mPage ${currentPage}/${pageCount}\x1b[0m`);
  }

  return lines.join("\n");
}

export async function checkbox<T = unknown>({
  message = "Select",
  choices,
  initial = 0,
  pageSize = 7,
  required = false,
  signal,
}: CheckboxOptions<T>): Promise<T[]> {
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("choices must be a non-empty array");
  }

  const normalized = choices.map(normalizeChoice);
  let pointer = Math.max(0, Math.min(initial | 0, normalized.length - 1));

  // Find first selectable choice if initial is disabled
  if (normalized[pointer].disabled) {
    let found = false;
    for (let i = pointer + 1; i < normalized.length; i++) {
      if (!normalized[i].disabled) {
        pointer = i;
        found = true;
        break;
      }
    }
    if (!found) {
      for (let i = pointer - 1; i >= 0; i--) {
        if (!normalized[i].disabled) {
          pointer = i;
          break;
        }
      }
    }
  }

  // Calculate initial pageStart based on page boundaries
  const initialPage = Math.floor(pointer / pageSize);
  let pageStart = initialPage * pageSize;

  // Ensure pageStart is within bounds
  pageStart = Math.max(0, Math.min(pageStart, normalized.length - pageSize));

  const stdin = process.stdin;
  const stdout = process.stdout;
  if (!stdin.isTTY) throw new Error("TTY required");

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  let typedBuffer = "";
  let typedTimeout: NodeJS.Timeout | undefined;

  const clearTypedBufferSoon = () => {
    if (typedTimeout) clearTimeout(typedTimeout);
    typedTimeout = setTimeout(() => {
      typedBuffer = "";
      return typedBuffer;
    }, 800);
  };

  let previousOutputLines = 0;

  function renderToScreen() {
    clearLine();
    // Move cursor to beginning of line
    stdout.write("\x1b[0G");
    stdout.write("\x1b[0J"); // clear from cursor to end of screen

    // Clear previous output by moving up and clearing lines
    for (let i = 0; i < previousOutputLines; i++) {
      stdout.write("\x1b[1A"); // Move up one line
      stdout.write("\x1b[2K"); // Clear the entire line
    }

    const out = render(
      normalized,
      pointer,
      pageStart,
      pageSize,
      message,
      typedBuffer,
    );

    // Count lines in current output
    previousOutputLines = out.split("\n").length;

    stdout.write(`${out}\n`);
  }

  function move(delta: number) {
    const len = normalized.length;
    let newIndex = pointer;
    do {
      newIndex = (newIndex + delta + len) % len;
    } while (normalized[newIndex].disabled && newIndex !== pointer);
    pointer = newIndex;

    // Update pageStart to snap to page boundaries
    const currentPage = Math.floor(pointer / pageSize);
    pageStart = currentPage * pageSize;

    // Ensure pageStart is within bounds
    pageStart = Math.max(0, Math.min(pageStart, normalized.length - pageSize));

    renderToScreen();
  }

  function jumpToIndexStartingWith(prefix: string) {
    const start = (pointer + 1) % normalized.length;
    const lowerPref = prefix.toLowerCase();
    for (let i = 0; i < normalized.length; i++) {
      const idx = (start + i) % normalized.length;
      if (normalized[idx].disabled) continue;
      if (normalized[idx].name.toLowerCase().startsWith(lowerPref)) {
        pointer = idx;

        // Update pageStart to snap to page boundaries
        const currentPage = Math.floor(pointer / pageSize);
        pageStart = currentPage * pageSize;

        // Ensure pageStart is within bounds
        pageStart = Math.max(
          0,
          Math.min(pageStart, normalized.length - pageSize),
        );

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

    function cleanup() {
      if (resolved) return;
      resolved = true;
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      if (typedTimeout) clearTimeout(typedTimeout);
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
        const selected = normalized.filter((ch) => ch.checked && !ch.disabled);
        if (required && selected.length === 0) {
          // Show error but don't exit
          renderToScreen();
          return;
        }
        cleanup();
        stdout.write("\n");
        resolve(selected.map((ch) => ch.value));
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
        for (let i = 0; i < normalized.length; i++) {
          if (!normalized[i].disabled) {
            pointer = i;
            break;
          }
        }
        // Update pageStart to snap to page boundaries
        const currentPage = Math.floor(pointer / pageSize);
        pageStart = currentPage * pageSize;
        pageStart = Math.max(
          0,
          Math.min(pageStart, normalized.length - pageSize),
        );
        renderToScreen();
        return;
      }
      if (key === "\x1b[F" || key === "\x1b[4~") {
        for (let i = normalized.length - 1; i >= 0; i--) {
          if (!normalized[i].disabled) {
            pointer = i;
            break;
          }
        }
        // Update pageStart to snap to page boundaries
        const currentPage = Math.floor(pointer / pageSize);
        pageStart = currentPage * pageSize;
        pageStart = Math.max(
          0,
          Math.min(pageStart, normalized.length - pageSize),
        );
        renderToScreen();
        return;
      }

      if (key === "\x7f" || key === "\b") {
        if (typedBuffer.length > 0) {
          typedBuffer = typedBuffer.slice(0, -1);
          if (typedBuffer.length === 0) clearTypedBufferSoon();
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
        typedBuffer += key;
        clearTypedBufferSoon();
        const found = jumpToIndexStartingWith(typedBuffer);
        if (!found) {
          typedBuffer = key;
          clearTypedBufferSoon();
          jumpToIndexStartingWith(typedBuffer);
        }
        renderToScreen();
        return;
      }
    }

    hideCursor();
    renderToScreen();
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
      console.log("You picked:", res);
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
