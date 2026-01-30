import fs from "node:fs/promises";
import { isNumber } from "@travisennis/stdlib/typeguards";
import { z } from "zod";
import type { WorkspaceContext } from "../index.ts";
import style from "../terminal/style.ts";
import { toDisplayPath } from "../utils/filesystem/path-display.ts";
import { joinWorkingDir, validatePath } from "../utils/filesystem/security.ts";
import { convertNullString } from "../utils/zod.ts";
import type { ToolExecutionOptions } from "./types.ts";
import { fileEncodingSchema } from "./types.ts";

// default limit in bytes
const DEFAULT_BYTE_LIMIT = 80 * 1024;

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
  maxBytes: z
    .preprocess((val) => convertNullString(val), z.coerce.number().nullable())
    .describe(
      "Maximum number of bytes to read. Set to 0 for no limit. (Default: 80KB)",
    ),
});

type ReadFileInputSchema = z.infer<typeof inputSchema>;

export const createReadFileTool = async (options: {
  workspace: WorkspaceContext;
}) => {
  const { primaryDir, allowedDirs } = options.workspace;
  const allowedDirectory = allowedDirs ?? [primaryDir];
  return {
    toolDef: {
      description: `Read the complete contents of a file from the file system unless startLine and lineCount are given to read a file selection. Handles various text encodings and provides detailed error messages if the file cannot be read. Use this tool when you need to examine the contents of a single file. Only works within allowed directories. Automatically limits file size to prevent overwhelming output. Default limit is ${DEFAULT_BYTE_LIMIT} bytes (${DEFAULT_BYTE_LIMIT / 1024}KB). Use maxBytes parameter to override this limit.`,
      inputSchema,
    },
    display({ path: providedPath, startLine, lineCount }: ReadFileInputSchema) {
      const displayPath = toDisplayPath(providedPath);
      return `${style.cyan(displayPath)}${startLine ? style.cyan(`:${startLine}`) : ""}${lineCount ? style.cyan(`:${lineCount}`) : ""}`;
    },
    async execute(
      {
        path: providedPath,
        encoding,
        startLine,
        lineCount,
        maxBytes,
      }: ReadFileInputSchema,
      { abortSignal }: ToolExecutionOptions,
    ): Promise<string> {
      if (abortSignal?.aborted) {
        throw new Error("File reading aborted");
      }

      const filePath = await validatePath(
        joinWorkingDir(providedPath, primaryDir),
        allowedDirectory,
        { abortSignal },
      );

      if (abortSignal?.aborted) {
        throw new Error("File reading aborted before file read");
      }

      let file = await fs.readFile(filePath, {
        encoding: encoding ?? "utf-8",
      });

      if (isNumber(startLine) || isNumber(lineCount)) {
        const lines = file.split("\n");
        const totalLines = lines.length;

        const startIndex = (startLine ?? 1) - 1;
        const count = lineCount ?? totalLines - startIndex;

        if (startIndex < 0 || startIndex >= totalLines) {
          throw new Error(
            `startLine ${startLine} is out of bounds for file with ${totalLines} lines.`,
          );
        }

        const endIndex = Math.min(startIndex + count, totalLines);
        file = lines.slice(startIndex, endIndex).join("\n");
      }

      const effectiveMaxBytes = maxBytes ?? DEFAULT_BYTE_LIMIT;

      if (
        effectiveMaxBytes !== null &&
        effectiveMaxBytes !== undefined &&
        effectiveMaxBytes > 0
      ) {
        const buffer = Buffer.from(file, encoding ?? "utf-8");
        if (buffer.byteLength > effectiveMaxBytes) {
          const truncatedBuffer = buffer.subarray(0, effectiveMaxBytes);
          file = truncatedBuffer.toString(encoding ?? "utf-8");
        }
      }

      return file;
    },
  };
};
