import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { isNumber } from "@travisennis/stdlib/typeguards";
import { z } from "zod";
import type { WorkspaceContext } from "../index.ts";
import style from "../terminal/style.ts";
import { toDisplayPath } from "../utils/filesystem/path-display.ts";
import { convertNullString } from "../utils/zod.ts";
import type { ToolExecutionOptions } from "./types.ts";
import { fileEncodingSchema } from "./types.ts";

// hardcoded limit in bytes (50KB) - not configurable by the agent
const BYTE_LIMIT = 50 * 1024;

// Resolve a path for reading, expanding ~ and handling relative paths
function resolveReadPath(providedPath: string, workingDir: string): string {
  // Expand ~ to home directory
  let resolved = providedPath;
  if (resolved.startsWith("~/") || resolved === "~") {
    resolved = path.join(os.homedir(), resolved.slice(1));
  }

  // If not absolute, join with working directory
  if (!path.isAbsolute(resolved)) {
    resolved = path.join(workingDir, resolved);
  }

  return path.normalize(resolved);
}

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

export const createReadFileTool = async (options: {
  workspace: WorkspaceContext;
}) => {
  const { primaryDir } = options.workspace;
  return {
    toolDef: {
      description:
        "Read the contents of a file. When you need to read multiple files, ALWAYS issue multiple Read tool calls in the same assistant message rather than reading one, waiting for the result, then reading the next. The runtime executes parallel tool calls concurrently, so batching reads is several times faster than serial reads.",
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
      }: ReadFileInputSchema,
      { abortSignal }: ToolExecutionOptions,
    ): Promise<string> {
      if (abortSignal?.aborted) {
        throw new Error("File reading aborted");
      }

      const filePath = resolveReadPath(providedPath, primaryDir);

      const effectiveEncoding = encoding ?? "utf-8";

      const file = await readFileContent(
        filePath,
        effectiveEncoding,
        startLine,
        lineCount,
        abortSignal,
      );

      return applyByteLimit(file, effectiveEncoding, BYTE_LIMIT);
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

// Truncate content to a byte limit, safely handling multi-byte encodings.
// Returns the truncated content with a message indicating how much remains.
function applyByteLimit(
  content: string,
  encoding: BufferEncoding,
  maxBytes: number,
): string {
  const byteLength = Buffer.byteLength(content, encoding);
  if (byteLength <= maxBytes) {
    return content;
  }

  const truncated = truncateToByteLimit(content, encoding, maxBytes);
  const truncatedBytes = Buffer.byteLength(truncated, encoding);
  const remainingBytes = byteLength - truncatedBytes;
  const limitKb = (maxBytes / 1024).toFixed(0);
  const remainingKb = (remainingBytes / 1024).toFixed(1);

  const message = [
    "",
    `[File truncated at ${limitKb}KB limit. ${remainingKb}KB remaining.]`,
    "To read more, use the startLine and lineCount parameters, or use Bash with head/tail/sed.",
  ].join("\n");

  return truncated + message;
}

// Safely truncate a string to a maximum number of bytes in the given encoding.
// Uses TextDecoder for UTF-8 to avoid splitting multi-byte characters.
function truncateToByteLimit(
  content: string,
  encoding: BufferEncoding,
  maxBytes: number,
): string {
  if (encoding === "utf-8" || encoding === "utf8") {
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(
      Buffer.from(content, encoding).subarray(0, maxBytes),
      {
        stream: true,
      },
    );
  }

  return Buffer.from(content, encoding).toString(encoding, 0, maxBytes);
}
