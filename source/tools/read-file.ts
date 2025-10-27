import fs from "node:fs/promises";
import { isNumber } from "@travisennis/stdlib/typeguards";
import type { ToolCallOptions } from "ai";
import { z } from "zod";
import { config } from "../config.ts";
import style from "../terminal/style.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import { joinWorkingDir, validatePath } from "./filesystem-utils.ts";
import type { ToolResult } from "./types.ts";
import { fileEncodingSchema } from "./types.ts";

export const ReadFileTool = {
  name: "readFile" as const,
};

const inputSchema = z.object({
  path: z.string().describe("Absolute path to file to read"),
  encoding: fileEncodingSchema.describe(
    'Encoding format for reading the file. Use "utf-8" as default for text files',
  ),
  startLine: z.coerce
    .number()
    .nullable()
    .describe(
      "1-based line number to start reading from. Pass null to start at beginning of file",
    ),
  lineCount: z.coerce
    .number()
    .nullable()
    .describe("Maximum number of lines to read. Pass null to get all lines."),
});

type ReadFileInputSchema = z.infer<typeof inputSchema>;

export const createReadFileTool = async ({
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
        "Read the complete contents of a file from the file system unless startLine and lineCount are given to read a file selection. " +
        "Handles various text encodings and provides detailed error messages " +
        "if the file cannot be read. Use this tool when you need to examine " +
        "the contents of a single file. Only works within allowed directories.",
      inputSchema,
    },
    async *execute(
      {
        path: providedPath,
        encoding,
        startLine,
        lineCount,
      }: ReadFileInputSchema,
      { toolCallId, abortSignal }: ToolCallOptions,
    ): AsyncGenerator<ToolResult> {
      try {
        // Check if execution has been aborted
        if (abortSignal?.aborted) {
          throw new Error("File reading aborted");
        }
        yield {
          id: toolCallId,
          event: "tool-init",
          data: `ReadFile: ${style.cyan(providedPath)}${startLine ? style.cyan(`:${startLine}`) : ""}${lineCount ? style.cyan(`:${lineCount}`) : ""}`,
        };

        const filePath = await validatePath(
          joinWorkingDir(providedPath, workingDir),
          allowedDirectory,
          { abortSignal },
        );

        if (abortSignal?.aborted) {
          throw new Error("File reading aborted before file read");
        }

        let file = await fs.readFile(filePath, { encoding });

        // Apply line-based selection if requested
        if (isNumber(startLine) || isNumber(lineCount)) {
          const lines = file.split("\n");
          const totalLines = lines.length;

          const startIndex = (startLine ?? 1) - 1; // Default to start of file if only lineCount is given
          const count = lineCount ?? totalLines - startIndex; // Default to read all lines from start if only startLine is given

          if (startIndex < 0 || startIndex >= totalLines) {
            const errorMsg = `startLine ${startLine} is out of bounds for file with ${totalLines} lines.`;
            yield { event: "tool-error", id: toolCallId, data: errorMsg };
            yield errorMsg;
            return;
          }

          const endIndex = Math.min(startIndex + count, totalLines);
          file = lines.slice(startIndex, endIndex).join("\n");
        }

        let tokenCount = 0;
        try {
          // Only calculate tokens for non-image files and if encoding is text-based
          if (encoding.startsWith("utf")) {
            tokenCount = tokenCounter.count(file);
          }
        } catch (tokenError) {
          console.info("Error calculating token count:", tokenError);
          // Log or handle error, but don't block file return
        }

        const maxTokens = (await config.readProjectConfig()).tools.maxTokens;
        // Adjust max token check message if line selection was used
        const maxTokenMessage =
          isNumber(startLine) || isNumber(lineCount)
            ? `Selected file content (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Consider adjusting startLine/lineCount or using grepFiles.`
            : `File content (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Please use startLine and lineCount parameters to read specific portions of the file, or using grepFiles to search for specific content.`;

        const result = tokenCount <= maxTokens ? file : maxTokenMessage;

        yield {
          id: toolCallId,
          event: "tool-completion",
          // Include token count only if calculated (i.e., for text files)
          data:
            tokenCount <= maxTokens
              ? `File read successfully ${tokenCount > 0 ? ` (${tokenCount} tokens)` : ""}`
              : result,
        };
        yield result;
      } catch (error) {
        const errorMsg = `Failed to read file: ${(error as Error).message}`;
        yield { event: "tool-error", id: toolCallId, data: errorMsg };
        yield errorMsg;
      }
    },
  };
};
