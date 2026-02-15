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

export const createCodeSearchTool = () => {
  return {
    toolDef: {
      description: `Search code semantically using colgrep (AI-powered semantic code search).
Use natural language queries like "function that handles user authentication"
to find relevant code even when keywords don't match exactly.
Supports hybrid search: combine regex filtering with semantic ranking.
Requires colgrep to be installed (see: https://github.com/lightonai/next-plaid)`,
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
      const safeRegexPattern =
        regexPattern === "null" || regexPattern === "undefined"
          ? null
          : regexPattern;
      const safeFilePattern =
        filePattern === "null" || filePattern === "undefined"
          ? null
          : filePattern;
      const safeExcludePattern =
        excludePattern === "null" || excludePattern === "undefined"
          ? null
          : excludePattern;
      const safeExcludeDir =
        excludeDir === "null" || excludeDir === "undefined" ? null : excludeDir;

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

      try {
        const effectivePath = path !== "." ? path : ".";
        const effectiveMaxResults = maxResults ?? DEFAULT_MAX_RESULTS;
        const effectiveContextLines = contextLines ?? DEFAULT_CONTEXT_LINES;

        const safeRegexPattern =
          regexPattern === "null" || regexPattern === "undefined"
            ? null
            : regexPattern;
        const safeFilePattern =
          filePattern === "null" || filePattern === "undefined"
            ? null
            : filePattern;
        const safeExcludePattern =
          excludePattern === "null" || excludePattern === "undefined"
            ? null
            : excludePattern;
        const safeExcludeDir =
          excludeDir === "null" || excludeDir === "undefined"
            ? null
            : excludeDir;

        // Wrap query in quotes for shell
        const quotedQuery = JSON.stringify(query);

        const args = [
          quotedQuery,
          ...(effectivePath !== "." ? [effectivePath] : []),
          ...(safeRegexPattern ? ["-e", safeRegexPattern] : []),
          ...(safeFilePattern ? ["--include", safeFilePattern] : []),
          ...(safeExcludePattern ? ["--exclude", safeExcludePattern] : []),
          ...(safeExcludeDir ? ["--exclude-dir", safeExcludeDir] : []),
          ...(effectiveMaxResults !== DEFAULT_MAX_RESULTS
            ? ["-k", String(effectiveMaxResults)]
            : []),
          ...(effectiveContextLines !== DEFAULT_CONTEXT_LINES
            ? ["-n", String(effectiveContextLines)]
            : []),
          ...(filesOnly ? ["-l"] : []),
          ...(showContent ? ["-c"] : []),
          ...(codeOnly ? ["--code-only"] : []),
        ];

        const colgrepResult = execSync(["colgrep", ...args].join(" "), {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 30000,
        });

        return colgrepResult;
      } catch (error) {
        const errorMessage = (error as Error).message;

        // Check if colgrep is not installed
        if (
          errorMessage.includes("ENOENT") ||
          errorMessage.includes("not found")
        ) {
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
    },
  };
};
