import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Terminal } from "./terminal.ts";

export interface EditorLaunchOptions {
  initialContent?: string;
  postfix?: string;
  terminal: Terminal;
  signal?: AbortSignal;
}

export interface EditorLaunchResult {
  content: string;
  aborted: boolean;
}

export async function launchEditor(
  options: EditorLaunchOptions,
): Promise<EditorLaunchResult> {
  const { initialContent = "", postfix = ".txt", terminal, signal } = options;

  if (signal?.aborted) {
    return { content: "", aborted: true };
  }

  const tempDir = await mkdtemp(join(tmpdir(), "acai-editor-"));
  const tempFile = join(tempDir, `edit${postfix}`);
  let enteredExternalMode = false;

  try {
    await writeFile(tempFile, initialContent);

    terminal.enterExternalMode();
    enteredExternalMode = true;

    const editor = process.env["EDITOR"] || process.env["VISUAL"] || "vi";
    const result = spawnSync(editor, [tempFile], {
      stdio: "inherit",
    });

    if (signal?.aborted) {
      return { content: "", aborted: true };
    }

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error(`Editor exited with code ${result.status}`);
    }

    const content = await readFile(tempFile, "utf-8");
    return { content, aborted: false };
  } finally {
    if (enteredExternalMode) {
      terminal.exitExternalMode();
    }
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
