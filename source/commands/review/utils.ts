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
