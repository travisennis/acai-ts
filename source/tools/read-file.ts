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

// default limit in bytes (20KB)
const DEFAULT_BYTE_LIMIT = 20 * 1024;

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
      "Maximum number of bytes to read. Set to 0 for no limit. (Default: 20KB)",
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

      const file = await readFileContent(
        filePath,
        effectiveEncoding,
        startLine,
        lineCount,
        abortSignal,
      );

      validateByteLimit(file, effectiveEncoding, effectiveMaxBytes);

      return file;
    },
  };
};

// Read file content either line-by-line or as a whole
async function readFileContent(
  filePath: string,
  encoding: BufferEncoding,
  startLine: number | null,
  lineCount: number | null,
  abortSignal: AbortSignal | undefined,
): Promise<string> {
  const useLineBasedRead = isNumber(startLine) || isNumber(lineCount);

  if (useLineBasedRead) {
    return readFileLines(filePath, startLine, lineCount, abortSignal);
  }

  if (abortSignal?.aborted) {
    throw new Error("File reading aborted before file read");
  }

  return fs.readFile(filePath, { encoding });
}

// Read specific lines from a file using streaming
async function readFileLines(
  filePath: string,
  startLine: number | null,
  lineCount: number | null,
  abortSignal: AbortSignal | undefined,
): Promise<string> {
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

  return lines.join("\n");
}

// Validate that file content doesn't exceed byte limit
function validateByteLimit(
  file: string,
  encoding: BufferEncoding,
  maxBytes: number,
): void {
  if (maxBytes <= 0) {
    return;
  }

  const byteLength = Buffer.byteLength(file, encoding);
  if (byteLength > maxBytes) {
    const fileSizeKb = (byteLength / 1024).toFixed(1);
    const limitKb = (maxBytes / 1024).toFixed(0);
    throw new Error(
      `File (${fileSizeKb}KB) exceeds the ${limitKb}KB read limit. To read this file, use one of these options:\n` +
        "• Set maxBytes: 0 to read the entire file\n" +
        "• Use startLine and lineCount to read specific portions (e.g., startLine: 1, lineCount: 100)\n" +
        "• Use the Grep tool to search for specific content\n" +
        `• Use the Bash tool with 'tail' or 'head' commands`,
    );
  }
}
