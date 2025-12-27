import { readFile, writeFile } from "node:fs/promises";
import { createTwoFilesPatch } from "diff";
import { z } from "zod";
import { config } from "../config.ts";
import { clearProjectStatusCache } from "../repl/project-status-line.ts";
import style from "../terminal/style.ts";
import {
  joinWorkingDir,
  validateFileNotReadOnly,
  validatePath,
} from "../utils/filesystem/security.ts";

import type { ToolExecutionOptions, ToolResult } from "./types.ts";

export const EditFileTool = {
  name: "Edit" as const,
};

const inputSchema = z.object({
  path: z.string().describe("The path of the file to edit."),
  edits: z.array(
    z.object({
      oldText: z
        .string()
        .describe(
          "Text to search for - must match exactly and enough context must be provided to uniquely match the target text. " +
            "Special characters require JSON escaping: backticks (\\`...\\`), quotes, backslashes. " +
            "For multi-line content, include exact newlines and indentation.",
        ),
      newText: z.string().describe("Text to replace with"),
    }),
  ),
});

type EditFileInputSchema = z.infer<typeof inputSchema>;

export const createEditFileTool = async ({
  workingDir,
  allowedDirs,
}: {
  workingDir: string;
  allowedDirs?: string[];
}) => {
  const allowedDirectory = allowedDirs ?? [workingDir];
  return {
    toolDef: {
      description:
        "Make line-based edits to a text file. Each edit replaces exact line sequences " +
        "with new content. Exact literal matching is used: no whitespace, indentation, escape, or newline normalization is applied when locating matches. " +
        "Provide enough context so the match is unique; otherwise the operation errors. Returns a git-style diff showing the changes made. " +
        "Only works within allowed directories. " +
        "Note: Special characters in oldText must be properly escaped for JSON (e.g., backticks as \\`...\\`). " +
        "Multi-line strings require exact character-by-character matching including whitespace.",
      inputSchema,
    },
    async *execute(
      { path, edits }: EditFileInputSchema,
      { toolCallId, abortSignal }: ToolExecutionOptions,
    ): AsyncGenerator<ToolResult> {
      try {
        if (abortSignal?.aborted) {
          throw new Error("File editing aborted");
        }

        yield {
          name: EditFileTool.name,
          id: toolCallId,
          event: "tool-init",
          data: `${style.cyan(path)}`,
        };

        const validPath = await validatePath(
          joinWorkingDir(path, workingDir),
          allowedDirectory,
          { abortSignal },
        );

        // Check if file is read-only
        const projectConfig = await config.getConfig();
        validateFileNotReadOnly(validPath, projectConfig, workingDir);

        const result = await applyFileEdits(
          validPath,
          edits,
          false,
          abortSignal,
        );

        yield {
          name: EditFileTool.name,
          id: toolCallId,
          event: "tool-update",
          data: result.trim(),
        };

        yield {
          name: EditFileTool.name,
          id: toolCallId,
          event: "tool-completion",
          data: `Applied ${edits.length} edits to ${style.cyan(path)}`,
        };

        // Clear project status cache since file operations change git status
        clearProjectStatusCache();

        yield result;
      } catch (error) {
        yield {
          name: EditFileTool.name,
          event: "tool-error",
          id: toolCallId,
          data: (error as Error).message,
        };
        yield `Failed to edit file: ${(error as Error).message}`;
      }
    },
  };
};

// file editing and diffing utilities
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function createUnifiedDiff(
  originalContent: string,
  newContent: string,
  filepath = "file",
): string {
  // Ensure consistent line endings for diff
  const normalizedOriginal = normalizeLineEndings(originalContent);
  const normalizedNew = normalizeLineEndings(newContent);
  return createTwoFilesPatch(
    filepath,
    filepath,
    normalizedOriginal,
    normalizedNew,
    "original",
    "modified",
  );
}

interface FileEdit {
  oldText: string;
  newText: string;
}

export async function applyFileEdits(
  filePath: string,
  edits: FileEdit[],
  dryRun = false,
  abortSignal?: AbortSignal,
): Promise<string> {
  if (abortSignal?.aborted) {
    throw new Error("File edit operation aborted");
  }
  // Read file content literally with signal
  const originalContent = await readFile(filePath, {
    encoding: "utf-8",
    signal: abortSignal,
  });

  if (edits.find((edit) => edit.oldText.length === 0)) {
    throw new Error(
      "Invalid oldText in edit. The value of oldText must be at least one character",
    );
  }

  // Apply edits sequentially using literal matches (allow multiple matches)
  let modifiedContent = originalContent;
  for (const edit of edits) {
    if (abortSignal?.aborted) {
      throw new Error("File edit operation aborted during processing");
    }

    const result = await applyEditWithLlmFix(edit, modifiedContent);

    if (result.success) {
      modifiedContent = result.content;
    } else {
      throw new Error("oldText not found in content");
    }
  }

  // Create unified diff (createUnifiedDiff normalizes line endings internally for diffing)
  const diff = createUnifiedDiff(originalContent, modifiedContent, filePath);

  // Format diff with appropriate number of backticks
  let numBackticks = 3;
  while (diff.includes("`".repeat(numBackticks))) {
    numBackticks++;
  }
  const formattedDiff = `${"`".repeat(numBackticks)} diff\n${diff}\n${"`".repeat(numBackticks)}`;

  if (!dryRun) {
    if (abortSignal?.aborted) {
      throw new Error("File edit operation aborted before writing");
    }
    // Write the modified content with signal
    await writeFile(filePath, modifiedContent, {
      encoding: "utf-8",
      signal: abortSignal,
    });
  }

  return formattedDiff;
}

interface ApplyEditResult {
  success: boolean;
  content: string;
}

/**
 * Applies a single edit
 */
async function applyEditWithLlmFix(
  edit: FileEdit,
  content: string,
): Promise<ApplyEditResult> {
  const { oldText, newText } = edit;

  // Try the original edit first
  const originalResult = applyLiteralEdit(content, oldText, newText);
  if (originalResult.matchCount > 0) {
    return { success: true, content: originalResult.content };
  }

  return { success: false, content };
}

interface LiteralEditResult {
  matchCount: number;
  content: string;
}

/**
 * Applies a literal search and replace operation
 */
function applyLiteralEdit(
  content: string,
  search: string,
  replace: string,
): LiteralEditResult {
  let modifiedContent = content;
  let matchCount = 0;
  let currentIndex = 0;

  while (currentIndex < modifiedContent.length) {
    const matchIndex = modifiedContent.indexOf(search, currentIndex);
    if (matchIndex === -1) {
      break;
    }

    matchCount++;

    // Apply the replacement
    modifiedContent =
      modifiedContent.slice(0, matchIndex) +
      replace +
      modifiedContent.slice(matchIndex + search.length);

    // Move current index past the replacement
    currentIndex = matchIndex + replace.length;
  }

  return { matchCount, content: modifiedContent };
}
