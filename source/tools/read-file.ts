import fs from "node:fs/promises";
import { isNumber } from "@travisennis/stdlib/typeguards";
import { z } from "zod";
import style from "../terminal/style.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import {
  manageTokenLimit,
  TokenLimitExceededError,
} from "../tokens/threshold.ts";
import { joinWorkingDir, validatePath } from "../utils/filesystem/security.ts";
import { convertNullString } from "../utils/zod.ts";
import type { ToolExecutionOptions, ToolResult } from "./types.ts";
import { fileEncodingSchema } from "./types.ts";

export const ReadFileTool = {
  name: "Read" as const,
};

const inputSchema = z.object({
  path: z.string().describe("Absolute path to file to read"),
  encoding: fileEncodingSchema
    .nullable()
    .default("utf-8")
    .describe(
      'Encoding format for reading the file. Use "utf-8" as default for text files',
    ),
  startLine: z
    .preprocess((val) => convertNullString(val), z.coerce.number().nullable())
    .describe(
      "1-based line number to start reading from. Required but nullable. Pass null to start at beginning of file",
    ),
  lineCount: z
    .preprocess((val) => convertNullString(val), z.coerce.number().nullable())
    .describe(
      "Maximum number of lines to read. Required but nullable. Pass null to get all lines.",
    ),
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
        "Read the complete contents of a file from the file system unless startLine and lineCount are given to read a file selection. Handles various text encodings and provides detailed error messages if the file cannot be read. Use this tool when you need to examine the contents of a single file. Only works within allowed directories.",
      inputSchema,
    },
    async *execute(
      {
        path: providedPath,
        encoding,
        startLine,
        lineCount,
      }: ReadFileInputSchema,
      { toolCallId, abortSignal }: ToolExecutionOptions,
    ): AsyncGenerator<ToolResult> {
      try {
        // Check if execution has been aborted
        if (abortSignal?.aborted) {
          throw new Error("File reading aborted");
        }
        yield {
          name: ReadFileTool.name,
          id: toolCallId,
          event: "tool-init",
          data: `${style.cyan(providedPath)}${startLine ? style.cyan(`:${startLine}`) : ""}${lineCount ? style.cyan(`:${lineCount}`) : ""}`,
        };

        const filePath = await validatePath(
          joinWorkingDir(providedPath, workingDir),
          allowedDirectory,
          { abortSignal },
        );

        if (abortSignal?.aborted) {
          throw new Error("File reading aborted before file read");
        }

        let file = await fs.readFile(filePath, {
          encoding: encoding ?? "utf-8",
        });

        // Apply line-based selection if requested
        if (isNumber(startLine) || isNumber(lineCount)) {
          const lines = file.split("\n");
          const totalLines = lines.length;

          const startIndex = (startLine ?? 1) - 1; // Default to start of file if only lineCount is given
          const count = lineCount ?? totalLines - startIndex; // Default to read all lines from start if only startLine is given

          if (startIndex < 0 || startIndex >= totalLines) {
            const errorMsg = `startLine ${startLine} is out of bounds for file with ${totalLines} lines.`;
            yield {
              name: ReadFileTool.name,
              event: "tool-error",
              id: toolCallId,
              data: errorMsg,
            };
            yield errorMsg;
            return;
          }

          const endIndex = Math.min(startIndex + count, totalLines);
          file = lines.slice(startIndex, endIndex).join("\n");
        }

        try {
          const result = await manageTokenLimit(
            file,
            tokenCounter,
            "ReadFile",
            isNumber(startLine) || isNumber(lineCount)
              ? "Consider adjusting startLine/lineCount or using grepFiles"
              : "Use startLine and lineCount parameters to read specific portions, or use grepFiles for targeted access",
            encoding ?? "utf-8",
          );

          // Calculate line count for the returned content
          const linesRead = result.content.split("\n").length;

          yield {
            name: ReadFileTool.name,
            id: toolCallId,
            event: "tool-completion",
            data: `Read ${linesRead} lines (${result.tokenCount} tokens)`,
          };
          yield result.content;
        } catch (error) {
          if (error instanceof TokenLimitExceededError) {
            yield {
              name: ReadFileTool.name,
              event: "tool-error",
              id: toolCallId,
              data: error.message,
            };
            yield error.message;
            return;
          }
          throw error;
        }
      } catch (error) {
        const errorMsg = `${(error as Error).message}`;
        yield {
          name: ReadFileTool.name,
          event: "tool-error",
          id: toolCallId,
          data: errorMsg,
        };
        yield errorMsg;
      }
    },
  };
};
