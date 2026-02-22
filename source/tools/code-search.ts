import { execSync } from "node:child_process";
import { inspect } from "node:util";
import { z } from "zod";
import style from "../terminal/style.ts";

import { toDisplayPath } from "../utils/filesystem/path-display.ts";
import { convertNullString } from "../utils/zod.ts";
import type { ToolExecutionOptions } from "./types.ts";

// default limit
const DEFAULT_MAX_RESULTS = 15;
const DEFAULT_CONTEXT_LINES = 6;

export const CodeSearchTool = {
  name: "CodeSearch" as const,
};

const inputSchema = z.object({
  query: z.string().describe("Natural language query for semantic search"),
  path: z.string().describe("Path to search in").default("."),
  regexPattern: z
    .preprocess((val) => convertNullString(val), z.string().nullable())
    .describe("Regex pre-filter (-e flag)"),
  filePattern: z
    .preprocess((val) => convertNullString(val), z.string().nullable())
    .describe("File filter (--include flag)"),
  excludePattern: z
    .preprocess((val) => convertNullString(val), z.string().nullable())
    .describe("Exclude pattern (--exclude flag)"),
  excludeDir: z
    .preprocess((val) => convertNullString(val), z.string().nullable())
    .describe("Exclude directories (--exclude-dir flag)"),
  maxResults: z
    .preprocess((val) => convertNullString(val), z.coerce.number().nullable())
    .describe("Number of results (-k flag)"),
  contextLines: z
    .preprocess((val) => convertNullString(val), z.coerce.number().nullable())
    .describe("Context lines (-n flag)"),
  filesOnly: z
    .preprocess((val) => convertNullString(val), z.coerce.boolean().nullable())
    .describe("List only files (-l flag)"),
  showContent: z
    .preprocess((val) => convertNullString(val), z.coerce.boolean().nullable())
    .describe("Show full content (-c flag)"),
  codeOnly: z
    .preprocess((val) => convertNullString(val), z.coerce.boolean().nullable())
    .describe("Skip config/text files (--code-only flag)"),
});

type CodeSearchInputSchema = z.infer<typeof inputSchema>;

/**
 * Converts string "null"/"undefined" back to actual null.
 * Zod preprocess converts null to "null" string, this reverses that.
 */
function normalizeNullableString(value: string | null): string | null {
  if (value === "null" || value === "undefined") {
    return null;
  }
  return value;
}

/**
 * Builds colgrep command arguments from search options
 */
function buildColgrepArgs(options: {
  query: string;
  path: string;
  regexPattern: string | null;
  filePattern: string | null;
  excludePattern: string | null;
  excludeDir: string | null;
  maxResults: number | null;
  contextLines: number | null;
  filesOnly: boolean | null;
  showContent: boolean | null;
  codeOnly: boolean | null;
}): string[] {
  const effectivePath = options.path !== "." ? options.path : ".";
  const effectiveMaxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  const effectiveContextLines = options.contextLines ?? DEFAULT_CONTEXT_LINES;

  const safeRegexPattern = normalizeNullableString(options.regexPattern);
  const safeFilePattern = normalizeNullableString(options.filePattern);
  const safeExcludePattern = normalizeNullableString(options.excludePattern);
  const safeExcludeDir = normalizeNullableString(options.excludeDir);

  const quotedQuery = JSON.stringify(options.query);

  const args: string[] = [quotedQuery];

  if (effectivePath !== ".") {
    args.push(effectivePath);
  }

  if (safeRegexPattern) {
    args.push("-e", safeRegexPattern);
  }
  if (safeFilePattern) {
    args.push("--include", safeFilePattern);
  }
  if (safeExcludePattern) {
    args.push("--exclude", safeExcludePattern);
  }
  if (safeExcludeDir) {
    args.push("--exclude-dir", safeExcludeDir);
  }
  if (effectiveMaxResults !== DEFAULT_MAX_RESULTS) {
    args.push("-k", String(effectiveMaxResults));
  }
  if (effectiveContextLines !== DEFAULT_CONTEXT_LINES) {
    args.push("-n", String(effectiveContextLines));
  }
  if (options.filesOnly) {
    args.push("-l");
  }
  if (options.showContent) {
    args.push("-c");
  }
  if (options.codeOnly) {
    args.push("--code-only");
  }

  return args;
}

/**
 * Converts execSync error to user-friendly message
 */
function handleColgrepError(
  error: unknown,
  query: string,
  path: string,
): never {
  const errorMessage = (error as Error).message;

  // Check if colgrep is not installed
  if (errorMessage.includes("ENOENT") || errorMessage.includes("not found")) {
    throw new Error(
      "colgrep is not installed. Please install it from https://github.com/lightonai/next-plaid",
    );
  }

  let userFriendlyError = `Error searching "${query}" in ${path}: ${errorMessage}`;

  if (errorMessage.includes("No such file or directory")) {
    userFriendlyError = `Path not found: "${path}" - check if the path exists and is accessible`;
  } else if (errorMessage.includes("permission denied")) {
    userFriendlyError = `Permission denied accessing "${path}"`;
  } else if (errorMessage.includes("timed out")) {
    userFriendlyError =
      "Search timed out after 30 seconds - try reducing maxResults";
  }

  throw new Error(userFriendlyError);
}

export const createCodeSearchTool = () => {
  return {
    toolDef: {
      description: "Semantic code search using natural language.",
      inputSchema,
    },
    display({
      query,
      path,
      regexPattern,
      filePattern,
      excludePattern,
      excludeDir,
      maxResults,
      contextLines,
      filesOnly,
      showContent,
      codeOnly,
    }: CodeSearchInputSchema) {
      const safeRegexPattern = normalizeNullableString(regexPattern);
      const safeFilePattern = normalizeNullableString(filePattern);
      const safeExcludePattern = normalizeNullableString(excludePattern);
      const safeExcludeDir = normalizeNullableString(excludeDir);

      const displayPath = toDisplayPath(path);
      const effectiveMaxResults = maxResults ?? DEFAULT_MAX_RESULTS;
      const effectiveContextLines = contextLines ?? DEFAULT_CONTEXT_LINES;

      let initMessage = `${style.cyan(inspect(query))} in ${style.cyan(displayPath)}`;
      if (safeRegexPattern) {
        initMessage += ` ${style.dim(`(regex: ${safeRegexPattern})`)}`;
      }
      if (safeFilePattern) {
        initMessage += ` ${style.dim(`(include: ${safeFilePattern})`)}`;
      }
      if (safeExcludePattern) {
        initMessage += ` ${style.dim(`(exclude: ${safeExcludePattern})`)}`;
      }
      if (safeExcludeDir) {
        initMessage += ` ${style.dim(`(exclude-dir: ${safeExcludeDir})`)}`;
      }
      if (effectiveMaxResults !== DEFAULT_MAX_RESULTS) {
        initMessage += ` ${style.dim(`(max: ${effectiveMaxResults})`)}`;
      }
      if (effectiveContextLines !== DEFAULT_CONTEXT_LINES) {
        initMessage += ` ${style.dim(`(context: ${effectiveContextLines})`)}`;
      }
      if (filesOnly) {
        initMessage += ` ${style.dim("(files only)")}`;
      }
      if (showContent) {
        initMessage += ` ${style.dim("(show content)")}`;
      }
      if (codeOnly) {
        initMessage += ` ${style.dim("(code only)")}`;
      }

      return initMessage;
    },
    async execute(
      {
        query,
        path,
        regexPattern,
        filePattern,
        excludePattern,
        excludeDir,
        maxResults,
        contextLines,
        filesOnly,
        showContent,
        codeOnly,
      }: CodeSearchInputSchema,
      { abortSignal }: ToolExecutionOptions,
    ): Promise<string> {
      if (abortSignal?.aborted) {
        throw new Error("CodeSearch aborted");
      }

      const args = buildColgrepArgs({
        query,
        path,
        regexPattern: normalizeNullableString(regexPattern),
        filePattern: normalizeNullableString(filePattern),
        excludePattern: normalizeNullableString(excludePattern),
        excludeDir: normalizeNullableString(excludeDir),
        maxResults,
        contextLines,
        filesOnly,
        showContent,
        codeOnly,
      });

      try {
        const colgrepResult = execSync(["colgrep", ...args].join(" "), {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 30000,
        });

        return colgrepResult;
      } catch (error) {
        handleColgrepError(error, query, path);
      }
    },
  };
};
