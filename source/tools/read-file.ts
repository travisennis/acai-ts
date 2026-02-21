import fs from "node:fs/promises";
import { createInterface } from "node:readline/promises";
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
      description: "Read the contents of a file.",
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

      const effectiveEncoding = encoding ?? "utf-8";
      const effectiveMaxBytes = maxBytes ?? DEFAULT_BYTE_LIMIT;

      // Use streaming for line-based reads to avoid loading entire file
      const useLineBasedRead = isNumber(startLine) || isNumber(lineCount);

      let file: string;

      if (useLineBasedRead) {
        // Streaming approach: only read needed lines
        const fileStream = await fs.open(filePath, "r");
        const rl = createInterface({
          input: fileStream.createReadStream(),
          crlfDelay: Number.POSITIVE_INFINITY,
        });

        const lines: string[] = [];
        const startIndex = (startLine ?? 1) - 1;
        const count = lineCount ?? Number.POSITIVE_INFINITY;
        let currentIndex = 0;

        for await (const line of rl) {
          if (currentIndex >= startIndex && currentIndex < startIndex + count) {
            lines.push(line);
          }
          currentIndex++;

          // Stop early if we've read past our range
          if (currentIndex >= startIndex + count) {
            break;
          }

          if (abortSignal?.aborted) {
            rl.close();
            await fileStream.close();
            throw new Error("File reading aborted");
          }
        }

        rl.close();
        await fileStream.close();

        if (startIndex >= currentIndex) {
          throw new Error(
            `startLine ${startLine} is out of bounds for file with ${currentIndex} lines.`,
          );
        }

        file = lines.join("\n");
      } else {
        if (abortSignal?.aborted) {
          throw new Error("File reading aborted before file read");
        }

        file = await fs.readFile(filePath, {
          encoding: effectiveEncoding,
        });
      }

      // Apply maxBytes limit if needed
      if (effectiveMaxBytes > 0) {
        const byteLength = Buffer.byteLength(file, effectiveEncoding);
        if (byteLength > effectiveMaxBytes) {
          const truncatedBuffer = Buffer.from(file, effectiveEncoding).subarray(
            0,
            effectiveMaxBytes,
          );
          file = truncatedBuffer.toString(effectiveEncoding);
        }
      }

      return file;
    },
  };
};
