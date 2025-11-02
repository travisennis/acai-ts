import { readFile, writeFile } from "node:fs/promises";
import type { ToolCallOptions } from "ai";
import { createTwoFilesPatch } from "diff";
import { z } from "zod";
import style from "../terminal/style.ts";
import { joinWorkingDir, validatePath } from "./filesystem-utils.ts";
import type { ToolResult } from "./types.ts";

export const EditFileTool = {
  name: "editFile" as const,
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
      { toolCallId, abortSignal }: ToolCallOptions,
    ): AsyncGenerator<ToolResult> {
      try {
        if (abortSignal?.aborted) {
          throw new Error("File editing aborted");
        }

        yield {
          id: toolCallId,
          event: "tool-init",
          data: `EditFile: ${style.cyan(path)}`,
        };

        const validPath = await validatePath(
          joinWorkingDir(path, workingDir),
          allowedDirectory,
          { abortSignal },
        );

        const result = await applyFileEdits(
          validPath,
          edits,
          false,
          abortSignal,
        );

        yield {
          id: toolCallId,
          event: "tool-completion",
          data: `EditFile: ${edits.length} edits applied successfully`,
        };

        yield result;
      } catch (error) {
        yield {
          event: "tool-error",
          id: toolCallId,
          data: `EditFile: ${(error as Error).message}`,
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
    const { oldText, newText } = edit; // Use literal oldText and newText

    // Find all occurrences of oldText
    let currentIndex = 0;
    let matchCount = 0;

    while (currentIndex < modifiedContent.length) {
      const matchIndex = modifiedContent.indexOf(oldText, currentIndex);
      if (matchIndex === -1) {
        break;
      }

      matchCount++;

      // Apply the replacement
      modifiedContent =
        modifiedContent.slice(0, matchIndex) +
        newText +
        modifiedContent.slice(matchIndex + oldText.length);

      // Move current index past the replacement
      currentIndex = matchIndex + newText.length;
    }

    if (matchCount === 0) {
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
  const formattedDiff = `${"`".repeat(numBackticks)}diff\n${diff}${"`".repeat(numBackticks)}\n\n`;

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
