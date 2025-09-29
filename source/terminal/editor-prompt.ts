import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as readline from "node:readline";

export interface EditorPromptOptions {
  message: string;
  default?: string;
  postfix?: string; // e.g. ".ts", ".json", ".md"
  editor?: string; // override default $EDITOR
  skipPrompt?: boolean; // if true, immediately launch editor without "Press Enter to continue"
  signal?: AbortSignal;
}

export async function editor(options: EditorPromptOptions): Promise<string> {
  const {
    message,
    default: defaultValue = "",
    postfix = ".txt",
    editor,
    skipPrompt = false,
    signal,
  } = options;

  const openEditor = (): string => {
    // pick editor: $EDITOR env or fallback to vi
    const editorCmd =
      editor ||
      process.env["VISUAL"] ||
      process.env["EDITOR"] ||
      (process.platform === "win32" ? "notepad" : "vi");

    // create temp file with postfix for syntax highlighting
    const tempFile = join(
      tmpdir(),
      `editor-prompt-${process.pid}-${Date.now()}${postfix}`,
    );
    writeFileSync(tempFile, defaultValue);

    // open editor
    spawnSync(editorCmd, [tempFile], { stdio: "inherit" });

    // read result and clean up
    const result = readFileSync(tempFile, "utf-8");
    unlinkSync(tempFile);

    return result.trim();
  };

  if (skipPrompt) {
    // Immediately launch editor without prompt
    return openEditor();
  }

  // Show prompt and wait for user confirmation
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<string>((resolve, reject) => {
    let resolved = false;

    function cleanup() {
      if (resolved) return;
      resolved = true;
      rl.close();
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

    rl.question(
      `${message} (opens in editor)\nPress Enter to continue...`,
      () => {
        cleanup();
        resolve(openEditor());
      },
    );

    rl.on("SIGINT", () => {
      cleanup();
      const err = new Error("Cancelled") as Error & { isCanceled?: boolean };
      err.isCanceled = true;
      reject(err);
    });
  });
}
