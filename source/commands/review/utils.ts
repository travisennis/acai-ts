import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { join } from "node:path";
import type { Terminal } from "../../tui/terminal.ts";
import type { FileChange } from "./types.ts";

function isDiffContentLine(line: string): boolean {
  return (
    (line.startsWith("+") && !line.startsWith("+++")) ||
    (line.startsWith("-") && !line.startsWith("---")) ||
    line.startsWith(" ") ||
    line.startsWith("index") ||
    line.startsWith("old mode") ||
    line.startsWith("new mode") ||
    line.startsWith("deleted file") ||
    line.startsWith("new file")
  );
}

function parseHunkStats(line: string, isNewFile: boolean): string {
  const statsMatch = line.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
  if (!statsMatch) {
    return "Additions: 1, Deletions: 0";
  }
  const deletions = isNewFile ? 0 : Number.parseInt(statsMatch[2], 10);
  const additions = Number.parseInt(statsMatch[4], 10);
  return `Additions: ${additions}, Deletions: ${deletions}`;
}

interface DiffParserState {
  fileChanges: FileChange[];
  currentFile: FileChange | null;
  inDiff: boolean;
  isNewFile: boolean;
}

function startNewFile(state: DiffParserState, line: string): void {
  if (state.currentFile) {
    state.fileChanges.push(state.currentFile);
  }
  const fileMatch = line.match(/diff --git a\/(.*) b\/(.*)/);
  if (!fileMatch) return;

  state.currentFile = { fileName: fileMatch[1], diff: "", stats: "" };
  state.inDiff = true;
  state.isNewFile =
    fileMatch[1] === "/dev/null" || fileMatch[2] === "/dev/null";
}

export function parseGitDiffFiles(diffOutput: string): FileChange[] {
  const lines = diffOutput.split("\n");
  const state: DiffParserState = {
    fileChanges: [],
    currentFile: null,
    inDiff: false,
    isNewFile: false,
  };

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      startNewFile(state, line);
    } else if (line.startsWith("@@") && state.currentFile) {
      state.currentFile.stats = parseHunkStats(line, state.isNewFile);
    } else if (state.inDiff && state.currentFile && isDiffContentLine(line)) {
      state.currentFile.diff += `${line}\n`;
    }
  }

  if (state.currentFile) {
    state.fileChanges.push(state.currentFile);
  }

  return state.fileChanges;
}

function formatDiffLine(line: string): string | null {
  if (line.trim() === "") return null;
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return `+${line.substring(1)}`;
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return `-${line.substring(1)}`;
  }
  if (line.startsWith(" ")) {
    return ` ${line.substring(1)}`;
  }
  return line;
}

export function formatFileDiffForDisplay(
  fileName: string,
  diff: string,
): string {
  const lines = diff.split("\n");
  const formattedLines: string[] = [`### ${fileName}`, "", "```diff"];

  for (const line of lines) {
    const formatted = formatDiffLine(line);
    if (formatted !== null) {
      formattedLines.push(formatted);
    }
  }

  formattedLines.push("```");
  return formattedLines.join("\n");
}

export async function getUntrackedFiles(
  untrackedOutput: string,
  cwd: string,
): Promise<FileChange[]> {
  const fileChanges: FileChange[] = [];
  const untrackedFiles = untrackedOutput
    .trim()
    .split("\n")
    .filter((file) => file.length > 0);

  for (const fileName of untrackedFiles) {
    try {
      const filePath = join(cwd, fileName);
      const fileContent = await fs.promises.readFile(filePath, "utf-8");
      const lines = fileContent.split("\n").length;

      // Create a diff-like representation for the untracked file
      const diff = `diff --git a/${fileName} b/${fileName}
new file mode 100644
index 0000000..0000000
--- /dev/null
+++ b/${fileName}
@@ -0,0 +1,${lines} @@
${fileContent
  .split("\n")
  .map((line) => `+${line}`)
  .join("\n")}
`;

      fileChanges.push({
        fileName,
        diff,
        stats: `Additions: ${lines}, Deletions: 0`,
      });
    } catch (error) {
      // Skip files that can't be read (e.g., directories, binary files)
      console.error(`Failed to read untracked file: ${fileName}`, error);
    }
  }

  return fileChanges;
}

/**
 * Open a file in the user's preferred editor ($EDITOR or $VISUAL)
 */
export function openFileInEditor(
  filePath: string,
  terminal: Terminal,
): { success: boolean; error?: string } {
  const editor = process.env["EDITOR"] || process.env["VISUAL"] || "vi";

  terminal.enterExternalMode();

  try {
    const result = spawnSync(editor, [filePath], {
      stdio: "inherit",
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    // Note: Editors often exit with non-zero codes (e.g., :cq in vim, or when
    // quitting without saving). We only treat spawn errors as failures, not
    // exit codes, since the user may intentionally exit with an error code.
    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  } finally {
    terminal.exitExternalMode();
  }
}
