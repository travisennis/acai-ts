import { readFile } from "node:fs/promises";
import type { ToolCallOptions } from "ai";
import { z } from "zod";
import { formatFile } from "../formatting.ts";
import style from "../terminal/style.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import { manageTokenLimit } from "../tokens/threshold.ts";
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
            return fileResult;
          }),
        );

        const formattedResults = await Promise.all(
          results.map(async (result) => {
            if (result.error) {
              return `${result.path}: Error - ${result.error}`;
            }
            // Apply token limit check to each file
            const managedResult = await manageTokenLimit(
              result.content ?? "",
              tokenCounter,
              "ReadMultipleFiles",
              "Use readFile with startLine/lineCount or grepFiles for targeted access",
            );
            return formatFile(result.path, managedResult.content, "markdown");
          }),
        );

        const finalResult = await manageTokenLimit(
          formattedResults.join("\n---\n"),
          tokenCounter,
          "ReadMultipleFiles",
          "Reduce number of files or use more specific paths",
        );

        let completionMessage: string;
        const filesReadCount = results.filter((r) => !r.error).length;
        const filesErrorCount = results.filter((r) => r.error).length;

        if (finalResult.truncated) {
          completionMessage = `Read ${filesReadCount} files, but combined output exceeded token limit. ${finalResult.content}`;
        } else {
          completionMessage = `Read ${filesReadCount} files successfully (${finalResult.tokenCount} tokens)`;
        }

        if (filesErrorCount > 0) {
          completionMessage += `, ${filesErrorCount} files could not be read`;
        }

        yield {
          id: toolCallId,
          event: "tool-completion",
          data: `ReadMultipleFiles: ${completionMessage}`,
        };

        yield finalResult.content;
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
