import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createTwoFilesPatch } from "diff";
import { z } from "zod";
import { config } from "../config/index.ts";
import type { WorkspaceContext } from "../index.ts";
import { clearProjectStatusCache } from "../repl/project-status.ts";
import style from "../terminal/style.ts";
import {
  validateFileNotReadOnly,
  validatePath,
} from "../utils/filesystem/security.ts";
import type { ToolExecutionOptions } from "./types.ts";

export const ApplyPatchTool = {
  name: "ApplyPatch" as const,
};

const inputSchema = z.object({
  patchText: z
    .string()
    .describe(
      "The full apply_patch text between *** Begin Patch and *** End Patch markers",
    ),
});

type ApplyPatchInputSchema = z.infer<typeof inputSchema>;

// Types for patch parsing - using snake_case to match the patch format
export type Hunk =
  | { type: "add"; path: string; contents: string }
  | { type: "delete"; path: string }
  | {
      type: "update";
      path: string;
      movePath?: string;
      chunks: UpdateFileChunk[];
    };

export interface UpdateFileChunk {
  oldLines: string[];
  newLines: string[];
  changeContext?: string;
  isEndOfFile?: boolean;
}

export type ApplyPatchFileChange =
  | { type: "add"; path: string; content: string }
  | { type: "delete"; path: string; content?: string }
  | {
      type: "update";
      path: string;
      unifiedDiff: string;
      movePath?: string;
      newContent: string;
    };

export interface ParsedApplyPatch {
  hunks: Hunk[];
}

// Patch parsing functions
function parsePatchHeader(
  lines: string[],
  startIdx: number,
): { filePath: string; movePath?: string; nextIdx: number } | null {
  const line = lines[startIdx];

  if (line.startsWith("*** Add File:")) {
    const filePath = line.split(":", 2)[1]?.trim();
    return filePath ? { filePath, nextIdx: startIdx + 1 } : null;
  }

  if (line.startsWith("*** Delete File:")) {
    const filePath = line.split(":", 2)[1]?.trim();
    return filePath ? { filePath, nextIdx: startIdx + 1 } : null;
  }

  if (line.startsWith("*** Update File:")) {
    const filePath = line.split(":", 2)[1]?.trim();
    let movePath: string | undefined;
    let nextIdx = startIdx + 1;

    if (nextIdx < lines.length && lines[nextIdx].startsWith("*** Move to:")) {
      movePath = lines[nextIdx].split(":", 2)[1]?.trim();
      nextIdx++;
    }

    return filePath ? { filePath, movePath, nextIdx } : null;
  }

  return null;
}

function parseUpdateFileChunks(
  lines: string[],
  startIdx: number,
): { chunks: UpdateFileChunk[]; nextIdx: number } {
  const chunks: UpdateFileChunk[] = [];
  let i = startIdx;

  while (i < lines.length && !lines[i].startsWith("***")) {
    if (lines[i].startsWith("@@")) {
      const contextLine = lines[i].substring(2).trim();
      i++;

      const oldLines: string[] = [];
      const newLines: string[] = [];
      let isEndOfFile = false;

      while (i < lines.length && !lines[i].startsWith("@@")) {
        const changeLine = lines[i];

        // Check for end of file marker first (before general *** check)
        if (changeLine === "*** End of File") {
          isEndOfFile = true;
          i++;
          break;
        }

        // Check for other *** markers (new file operations)
        if (changeLine.startsWith("***")) {
          break;
        }

        if (changeLine.startsWith(" ")) {
          const content = changeLine.substring(1);
          oldLines.push(content);
          newLines.push(content);
        } else if (changeLine.startsWith("-")) {
          oldLines.push(changeLine.substring(1));
        } else if (changeLine.startsWith("+")) {
          newLines.push(changeLine.substring(1));
        }

        i++;
      }

      chunks.push({
        oldLines,
        newLines,
        changeContext: contextLine || undefined,
        isEndOfFile: isEndOfFile || undefined,
      });
    } else {
      i++;
    }
  }

  return { chunks, nextIdx: i };
}

function parseAddFileContent(
  lines: string[],
  startIdx: number,
): { content: string; nextIdx: number } {
  let content = "";
  let i = startIdx;

  while (i < lines.length && !lines[i].startsWith("***")) {
    if (lines[i].startsWith("+")) {
      content += `${lines[i].substring(1)}\n`;
    }
    i++;
  }

  if (content.endsWith("\n")) content = content.slice(0, -1);
  return { content, nextIdx: i };
}

export function parsePatch(patchText: string): ParsedApplyPatch {
  const lines = patchText.split("\n");
  const hunks: Hunk[] = [];

  const beginMarker = "*** Begin Patch";
  const endMarker = "*** End Patch";

  const beginIdx = lines.findIndex((l) => l.trim() === beginMarker);
  const endIdx = lines.findIndex((l) => l.trim() === endMarker);

  if (beginIdx === -1 || endIdx === -1 || beginIdx >= endIdx) {
    throw new Error("Invalid patch format: missing Begin/End markers");
  }

  let i = beginIdx + 1;
  while (i < endIdx) {
    const header = parsePatchHeader(lines, i);
    if (!header) {
      i++;
      continue;
    }

    if (lines[i].startsWith("*** Add File:")) {
      const { content, nextIdx } = parseAddFileContent(lines, header.nextIdx);
      hunks.push({ type: "add", path: header.filePath, contents: content });
      i = nextIdx;
      continue;
    }

    if (lines[i].startsWith("*** Delete File:")) {
      hunks.push({ type: "delete", path: header.filePath });
      i = header.nextIdx;
      continue;
    }

    if (lines[i].startsWith("*** Update File:")) {
      const { chunks: parsedChunks, nextIdx } = parseUpdateFileChunks(
        lines,
        header.nextIdx,
      );
      hunks.push({
        type: "update",
        path: header.filePath,
        movePath: header.movePath,
        chunks: parsedChunks,
      });
      i = nextIdx;
      continue;
    }

    i++;
  }

  return { hunks };
}

function resolvePathInRoot(
  rootAbs: string,
  p: string,
): { abs: string; rel: string } {
  // Relative paths are resolved against rootAbs
  // Absolute paths are used as-is (but validated later)
  const abs = path.isAbsolute(p) ? path.normalize(p) : path.resolve(rootAbs, p);
  const rel = path.relative(rootAbs, abs) || ".";
  return { abs, rel };
}

function seekSequence(
  lines: string[],
  pattern: string[],
  startIndex: number,
): number {
  if (pattern.length === 0) return -1;

  for (let i = startIndex; i <= lines.length - pattern.length; i++) {
    let matches = true;
    for (let j = 0; j < pattern.length; j++) {
      if (lines[i + j] !== pattern[j]) {
        matches = false;
        break;
      }
    }
    if (matches) return i;
  }

  return -1;
}

function applyReplacements(
  lines: string[],
  replacements: Array<[number, number, string[]]>,
): string[] {
  const result = [...lines];
  for (let i = replacements.length - 1; i >= 0; i--) {
    const [startIdx, oldLen, newSegment] = replacements[i];
    result.splice(startIdx, oldLen);
    for (let j = 0; j < newSegment.length; j++)
      result.splice(startIdx + j, 0, newSegment[j]);
  }
  return result;
}

function computeReplacements(
  originalLines: string[],
  filePath: string,
  chunks: UpdateFileChunk[],
): Array<[number, number, string[]]> {
  const replacements: Array<[number, number, string[]]> = [];
  let lineIndex = 0;

  for (const chunk of chunks) {
    if (chunk.changeContext) {
      const contextIdx = seekSequence(
        originalLines,
        [chunk.changeContext],
        lineIndex,
      );
      if (contextIdx === -1) {
        throw new Error(
          `Failed to find context '${chunk.changeContext}' in ${filePath}`,
        );
      }
      lineIndex = contextIdx + 1;
    }

    if (chunk.oldLines.length === 0) {
      const insertionIdx =
        originalLines.length > 0 &&
        originalLines[originalLines.length - 1] === ""
          ? originalLines.length - 1
          : originalLines.length;
      replacements.push([insertionIdx, 0, chunk.newLines]);
      continue;
    }

    let pattern = chunk.oldLines;
    let newSlice = chunk.newLines;
    let found = seekSequence(originalLines, pattern, lineIndex);

    if (
      found === -1 &&
      pattern.length > 0 &&
      pattern[pattern.length - 1] === ""
    ) {
      pattern = pattern.slice(0, -1);
      if (newSlice.length > 0 && newSlice[newSlice.length - 1] === "")
        newSlice = newSlice.slice(0, -1);
      found = seekSequence(originalLines, pattern, lineIndex);
    }

    if (found !== -1) {
      replacements.push([found, pattern.length, newSlice]);
      lineIndex = found + pattern.length;
    } else {
      throw new Error(
        `Failed to find expected lines in ${filePath}:\n${chunk.oldLines.join("\n")}`,
      );
    }
  }

  replacements.sort((a, b) => a[0] - b[0]);
  return replacements;
}

function generateUnifiedDiff(
  oldContent: string,
  newContent: string,
  filePath: string,
): string {
  return createTwoFilesPatch(
    filePath,
    filePath,
    oldContent,
    newContent,
    "original",
    "modified",
  );
}

function deriveNewContentsFromChunks(
  fileAbsPath: string,
  chunks: UpdateFileChunk[],
): { unifiedDiff: string; content: string } {
  let originalContent: string;
  try {
    originalContent = fs.readFileSync(fileAbsPath, "utf-8");
  } catch (error) {
    throw new Error(`Failed to read file ${fileAbsPath}: ${String(error)}`);
  }

  const originalLines = originalContent.split("\n");
  if (
    originalLines.length > 0 &&
    originalLines[originalLines.length - 1] === ""
  )
    originalLines.pop();

  const replacements = computeReplacements(originalLines, fileAbsPath, chunks);
  const newLines = applyReplacements(originalLines, replacements);

  // ensure trailing newline
  if (newLines.length === 0 || newLines[newLines.length - 1] !== "")
    newLines.push("");

  const newContent = newLines.join("\n");
  return {
    unifiedDiff: generateUnifiedDiff(originalContent, newContent, fileAbsPath),
    content: newContent,
  };
}

async function applyChanges(
  changes: ApplyPatchFileChange[],
  signal?: AbortSignal,
): Promise<string[]> {
  const changed: string[] = [];

  for (const change of changes) {
    if (signal?.aborted) throw new Error("Cancelled");

    if (change.type === "add") {
      const dir = path.dirname(change.path);
      if (dir !== "." && dir !== "/") await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(change.path, change.content, "utf-8");
      changed.push(change.path);
      continue;
    }

    if (change.type === "delete") {
      await fsp.unlink(change.path).catch(() => {});
      changed.push(change.path);
      continue;
    }

    // update
    if (change.movePath) {
      const dir = path.dirname(change.movePath);
      if (dir !== "." && dir !== "/") await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(change.movePath, change.newContent, "utf-8");
      await fsp.unlink(change.path).catch(() => {});
      changed.push(change.movePath);
      continue;
    }

    await fsp.writeFile(change.path, change.newContent, "utf-8");
    changed.push(change.path);
  }

  return changed;
}

export const createApplyPatchTool = async (options: {
  workspace: WorkspaceContext;
}) => {
  const { primaryDir, allowedDirs } = options.workspace;
  const allowedDirectories = allowedDirs ?? [primaryDir];
  const projectConfig = await config.getConfig();

  return {
    toolDef: {
      description:
        "Apply a high-level apply_patch diff to modify files.\n\n" +
        "Input must be in the apply_patch format surrounded by markers:\n\n" +
        "*** Begin Patch\n" +
        "*** Update File: path/to/file\n" +
        "@@ optional context line\n" +
        " unchanged line\n" +
        "- removed line\n" +
        "+ added line\n" +
        "*** End Patch\n\n" +
        "Supported operations:\n" +
        "- *** Add File: path/to/file (content lines prefixed with +)\n" +
        "- *** Update File (with optional *** Move to: new/path)\n" +
        "- *** Delete File: path/to/file\n\n" +
        "File paths may be absolute or relative to the project directory.",
      inputSchema,
    },
    display({ patchText }: ApplyPatchInputSchema) {
      // Extract number of files being modified from patch text
      try {
        const { hunks } = parsePatch(patchText);
        return `${style.cyan("apply patch")} (${hunks.length} file${hunks.length === 1 ? "" : "s"})`;
      } catch {
        return `${style.cyan("apply patch")}`;
      }
    },
    async execute(
      { patchText }: ApplyPatchInputSchema,
      { abortSignal }: ToolExecutionOptions,
    ): Promise<string> {
      if (abortSignal?.aborted) {
        throw new Error("Apply patch aborted");
      }

      const root = path.resolve(primaryDir);

      const { hunks } = parsePatch(patchText);
      if (hunks.length === 0) {
        return "No changes found in patch.";
      }

      // Build a list of resolved file changes (absolute paths), and a diff preview.
      const changes: ApplyPatchFileChange[] = [];
      let diffOutput = "";

      for (const hunk of hunks) {
        if (abortSignal?.aborted) throw new Error("Cancelled");

        const p = resolvePathInRoot(root, hunk.path);

        // Validate path is within allowed directories
        const validPath = await validatePath(p.abs, allowedDirectories, {
          requireExistence: hunk.type !== "add",
          abortSignal,
        });

        if (hunk.type === "add") {
          changes.push({
            type: "add",
            path: validPath,
            content: hunk.contents,
          });
          continue;
        }

        if (hunk.type === "delete") {
          // Validate file is not read-only before deletion
          validateFileNotReadOnly(validPath, projectConfig, primaryDir);
          changes.push({ type: "delete", path: validPath });
          continue;
        }

        // update - validate file is not read-only
        validateFileNotReadOnly(validPath, projectConfig, primaryDir);

        let moveAbs: string | undefined;
        if (hunk.movePath) {
          const moveP = resolvePathInRoot(root, hunk.movePath);
          moveAbs = await validatePath(moveP.abs, allowedDirectories, {
            requireExistence: false,
            abortSignal,
          });
        }

        const upd = deriveNewContentsFromChunks(validPath, hunk.chunks);
        changes.push({
          type: "update",
          path: validPath,
          movePath: moveAbs,
          newContent: upd.content,
          unifiedDiff: upd.unifiedDiff,
        });
        if (upd.unifiedDiff) {
          diffOutput += `*** Update File: ${path.relative(root, moveAbs ?? validPath)}\n`;
          diffOutput += `${upd.unifiedDiff}\n`;
        }
      }

      // Apply changes
      const changedAbs = await applyChanges(changes, abortSignal);
      const changedRel = changedAbs.map((p) => path.relative(root, p));

      clearProjectStatusCache();

      const summary = `${changedRel.length} file(s) changed`;
      const filesList = changedRel.map((x) => `  ${x}`).join("\n");

      return `Patch applied successfully. ${summary}\n${filesList}\n\n${diffOutput}`;
    },
  };
};
