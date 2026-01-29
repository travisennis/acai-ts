import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { join } from "node:path";
import type { Terminal } from "../../tui/terminal.ts";
import type { FileChange } from "./types.ts";

export function parseGitDiffFiles(diffOutput: string): FileChange[] {
  const lines = diffOutput.split("\n");
  const fileChanges: FileChange[] = [];
  let currentFile: FileChange | null = null;
  let inDiff = false;
  let isNewFile = false;

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      if (currentFile) {
        fileChanges.push(currentFile);
      }

      const fileMatch = line.match(/diff --git a\/(.*) b\/(.*)/);
      if (fileMatch) {
        currentFile = {
          fileName: fileMatch[1],
          diff: "",
          stats: "",
        };
        inDiff = true;
        isNewFile =
          fileMatch[1] === "/dev/null" || fileMatch[2] === "/dev/null";
      }
    } else if (line.startsWith("@@")) {
      const statsMatch = line.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
      if (statsMatch && currentFile) {
        const deletions = Number.parseInt(statsMatch[2], 10);
        const additions = Number.parseInt(statsMatch[4], 10);
        const actualDeletions = isNewFile ? 0 : deletions;
        currentFile.stats = `Additions: ${additions}, Deletions: ${actualDeletions}`;
      } else if (currentFile) {
        currentFile.stats = "Additions: 1, Deletions: 0";
      }
    } else if (inDiff && currentFile) {
      if (
        (line.startsWith("+") && !line.startsWith("+++")) ||
        (line.startsWith("-") && !line.startsWith("---")) ||
        line.startsWith(" ") ||
        line.startsWith("index") ||
        line.startsWith("old mode") ||
        line.startsWith("new mode") ||
        line.startsWith("deleted file") ||
        line.startsWith("new file")
      ) {
        currentFile.diff += `${line}\n`;
      }
    }
  }

  if (currentFile) {
    fileChanges.push(currentFile);
  }

  return fileChanges;
}

export function formatFileDiffForDisplay(
  fileName: string,
  diff: string,
): string {
  // Note: Cannot use style here as it's a UI concern - this is a display utility
  const lines = diff.split("\n");
  const formattedLines: string[] = [];

  formattedLines.push(`### ${fileName}`);
  formattedLines.push("");

  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      formattedLines.push(`+${line.substring(1)}`);
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      formattedLines.push(`-${line.substring(1)}`);
    } else if (line.startsWith(" ")) {
      formattedLines.push(` ${line.substring(1)}`);
    } else if (line.startsWith("@@")) {
      formattedLines.push(line);
    } else if (
      line.startsWith("index") ||
      line.startsWith("old mode") ||
      line.startsWith("new mode") ||
      line.startsWith("deleted file") ||
      line.startsWith("new file")
    ) {
      formattedLines.push(line);
    } else if (line.trim() === "") {
    } else {
      formattedLines.push(line);
    }
  }

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
