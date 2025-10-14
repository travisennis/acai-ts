import { readFile, writeFile } from "node:fs/promises";
import type { ToolCallOptions } from "ai";
import { createTwoFilesPatch } from "diff";
import { z } from "zod";
import type { Terminal } from "../terminal/index.ts";
import style from "../terminal/style.ts";
import type { AskResponse, ToolExecutor } from "../tool-executor.ts";
import { joinWorkingDir, validatePath } from "./filesystem-utils.ts";
import type { Message } from "./types.ts";

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
  terminal,
  toolExecutor,
}: {
  workingDir: string;
  terminal?: Terminal;
  toolExecutor?: ToolExecutor;
}) => {
  const allowedDirectory = workingDir;
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
    ): AsyncGenerator<Message, string> {
      try {
        if (abortSignal?.aborted) {
          throw new Error("File editing aborted");
        }

        yield {
          id: toolCallId,
          event: "tool-init",
          data: `Editing file: ${style.cyan(path)}`,
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
          data: "Edits applied successfully.",
        };

        return result;
      } catch (error) {
        yield {
          event: "tool-error",
          id: toolCallId,
          data: `Failed to edit file: ${(error as Error).message}`,
        };
        return `Failed to edit file: ${(error as Error).message}`;
      }
    },
    ask: async (
      { path, edits }: EditFileInputSchema,
      {
        toolCallId,
        abortSignal,
      }: { toolCallId: string; abortSignal?: AbortSignal },
    ): Promise<{ approve: true } | { approve: false; reason: string }> => {
      if (terminal) {
        const validPath = await validatePath(
          joinWorkingDir(path, workingDir),
          allowedDirectory,
          { abortSignal },
        );

        // Show diff preview
        terminal.writeln(
          `\n${style.blue.bold("●")} Proposing file changes: ${style.cyan(path)}`,
        );

        terminal.lineBreak();

        const diffPreview = await applyFileEdits(
          validPath,
          edits,
          true,
          abortSignal,
        );

        terminal.writeln(
          `The agent is proposing the following ${style.cyan(edits.length)} edits:`,
        );

        terminal.hr();

        terminal.display(diffPreview);

        terminal.hr();

        let userResponse: AskResponse | undefined;
        // Prompt only when a toolExecutor is present
        if (toolExecutor) {
          const ctx = {
            toolName: EditFileTool.name,
            toolCallId,
            message: "What would you like to do with these changes?",
            choices: {
              accept: "Accept these changes",
              acceptAll: "Accept all future edits (including these)",
              reject: "Reject these changes",
            },
          };
          try {
            userResponse = await toolExecutor.ask(ctx, { abortSignal });
          } catch (e) {
            if ((e as Error).name === "AbortError") {
              throw new Error("File editing aborted during user input");
            }
            throw e;
          }
        }

        const { result: userChoice, reason } = userResponse ?? {
          result: "accept",
        };

        terminal.lineBreak();

        if (userChoice === "accept-all") {
          terminal.writeln(
            style.yellow("✓ Auto-accept mode enabled for all edits"),
          );
          terminal.lineBreak();
        }

        if (userChoice === "reject") {
          terminal.lineBreak();

          const rejectionReason = reason || "No reason provided";
          return {
            approve: false,
            reason: `The user rejected these changes. Reason: ${rejectionReason}`,
          };
        }
      }
      return {
        approve: true,
      };
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

  // Apply edits sequentially using strict literal, unique matches
  let modifiedContent = originalContent;
  for (const edit of edits) {
    if (abortSignal?.aborted) {
      throw new Error("File edit operation aborted during processing");
    }
    const { oldText, newText } = edit; // Use literal oldText and newText

    // Strict literal match: find exactly one occurrence without any normalization
    const firstIndex = modifiedContent.indexOf(oldText);
    if (firstIndex === -1) {
      throw new Error("oldText not found in content");
    }
    const secondIndex = modifiedContent.indexOf(
      oldText,
      firstIndex + oldText.length,
    );
    if (secondIndex !== -1) {
      throw new Error(
        "oldText found multiple times and requires more code context to uniquely identify the intended match",
      );
    }

    modifiedContent =
      modifiedContent.slice(0, firstIndex) +
      newText +
      modifiedContent.slice(firstIndex + oldText.length);
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
