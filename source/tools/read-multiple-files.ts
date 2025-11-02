import { readFile } from "node:fs/promises";
import type { ToolCallOptions } from "ai";
import { z } from "zod";
import { config } from "../config.ts";
import { formatFile } from "../formatting.ts";
import style from "../terminal/style.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import { joinWorkingDir, validatePath } from "./filesystem-utils.ts";
import type { ToolResult } from "./types.ts";

export const ReadMultipleFilesTool = {
  name: "readMultipleFiles" as const,
};

const inputSchema = z.object({
  paths: z.array(z.string()),
});

type ReadMultipleFilesInputSchema = z.infer<typeof inputSchema>;

export const createReadMultipleFilesTool = async ({
  workingDir,
  allowedDirs,
  tokenCounter,
}: {
  workingDir: string;
  allowedDirs?: string[];
  tokenCounter: TokenCounter;
}) => {
  const allowedDirectory = allowedDirs ?? [workingDir];

  return {
    toolDef: {
      description:
        "Read the contents of multiple files simultaneously. This is more " +
        "efficient than reading files one by one when you need to analyze " +
        "or compare multiple files. Each file's content is returned with its " +
        "path as a reference. Failed reads for individual files won't stop " +
        "the entire operation. Only works within allowed directories.",
      inputSchema,
    },
    async *execute(
      { paths }: ReadMultipleFilesInputSchema,
      { toolCallId, abortSignal }: ToolCallOptions,
    ): AsyncGenerator<ToolResult> {
      try {
        // Check if execution has been aborted
        if (abortSignal?.aborted) {
          throw new Error("Multiple file reading aborted");
        }

        yield {
          id: toolCallId,
          event: "tool-init",
          data: `ReadMultipleFiles: ${paths.map((p) => style.cyan(p)).join(", ")}`,
        };

        if (abortSignal?.aborted) {
          throw new Error("Multiple file reading aborted before reading files");
        }

        const maxTokens = (await config.readProjectConfig()).tools.maxTokens;
        const results = await Promise.all(
          paths.map(async (filePath) => {
            if (abortSignal?.aborted) {
              throw new Error(
                "Multiple file reading aborted during file processing",
              );
            }
            const fileResult = await validateAndReadFile(
              filePath,
              workingDir,
              allowedDirectory,
            );
            return countTokensAndCheckLimit(
              fileResult,
              tokenCounter,
              maxTokens,
            );
          }),
        );

        let totalTokens = 0;
        let filesReadCount = 0;
        let filesExceededLimitCount = 0;
        let filesErrorCount = 0;
        const formattedResults = results.map((result) => {
          if (result.error) {
            filesErrorCount++;
            return `${result.path}: Error - ${result.error}`;
          }
          // Check if tokenCount is > 0, meaning it wasn't skipped
          if (result.tokenCount > 0) {
            filesReadCount++;
          } else if (
            result.content?.includes("exceeds maximum allowed tokens")
          ) {
            filesExceededLimitCount++;
          }
          totalTokens += result.tokenCount; // Add the token count (will be 0 for skipped files)
          // Return content (or max token message)
          return formatFile(result.path, result.content ?? "", "markdown");
        });

        let completionMessage: string;
        if (filesReadCount === paths.length) {
          completionMessage = `Read ${paths.length} files successfully (${totalTokens} total tokens).`;
        } else {
          const parts: string[] = [];
          if (filesReadCount > 0) {
            parts.push(
              `Read ${filesReadCount} files successfully (${totalTokens} total tokens)`,
            );
          }
          if (filesExceededLimitCount > 0) {
            parts.push(
              `${filesExceededLimitCount} files exceeded token limit and were skipped`,
            );
          }
          if (filesErrorCount > 0) {
            parts.push(`${filesErrorCount} files could not be read`);
          }
          completionMessage = `${parts.join(", ")}.`;
        }

        yield {
          id: toolCallId,
          event: "tool-completion",
          data: `ReadMultipleFiles: ${completionMessage}`,
        };

        yield formattedResults.join("\n---\n");
      } catch (error) {
        const errorMsg = `ReadMultipleFiles: ${(error as Error).message}`;
        yield {
          id: toolCallId,
          event: "tool-error",
          data: errorMsg,
        };
        yield errorMsg;
      }
    },
  };
};

async function validateAndReadFile(
  filePath: string,
  workingDir: string,
  allowedDirectory: string | string[],
): Promise<{
  path: string;
  content: string | null;
  error: string | null;
}> {
  try {
    const validPath = await validatePath(
      joinWorkingDir(filePath, workingDir),
      allowedDirectory,
    );
    const content = await readFile(validPath, "utf-8");
    return {
      path: filePath,
      content,
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      path: filePath,
      content: null,
      error: errorMessage,
    };
  }
}

async function countTokensAndCheckLimit(
  fileResult: { path: string; content: string | null; error: string | null },
  tokenCounter: TokenCounter,
  maxTokens: number,
): Promise<{
  path: string;
  content: string | null;
  tokenCount: number;
  error: string | null;
}> {
  if (fileResult.error || fileResult.content === null) {
    return {
      path: fileResult.path,
      content: null,
      tokenCount: 0,
      error: fileResult.error,
    };
  }

  let tokenCount = 0;
  try {
    tokenCount = tokenCounter.count(fileResult.content);
  } catch (tokenError) {
    console.error("Error calculating token count:", tokenError);
    // Handle token calculation error if needed
  }

  const maxTokenMessage = `File content (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Use readFile with startLine/lineCount or grepFiles for targeted access.`;

  const finalContent =
    tokenCount > maxTokens ? maxTokenMessage : fileResult.content;
  const actualTokenCount = tokenCount > maxTokens ? 0 : tokenCount; // Don't count tokens for skipped files

  return {
    path: fileResult.path,
    content: finalContent,
    tokenCount: actualTokenCount,
    error: null,
  };
}
