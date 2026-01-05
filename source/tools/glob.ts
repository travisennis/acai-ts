import * as fs from "node:fs";
import * as nodePath from "node:path";
import { z } from "zod";
import style from "../terminal/style.ts";

import { glob } from "../utils/glob.ts";
import { convertNullString } from "../utils/zod.ts";
import type { ToolExecutionOptions, ToolResult } from "./types.ts";

const DEFAULT_MAX_RESULTS = 100;

export const GlobTool = {
  name: "Glob" as const,
};

export const inputSchema = z.object({
  patterns: z
    .union([z.string(), z.array(z.string())])
    .describe(
      "Glob patterns to search for (e.g., '*.ts', '**/*.test.ts', 'src/**/*.js')",
    ),
  path: z.string().describe("Base directory to search in"),
  gitignore: z
    .preprocess((val) => convertNullString(val), z.coerce.boolean().nullable())
    .describe("Respect ignore patterns in .gitignore files. (default: true)"),
  recursive: z
    .preprocess((val) => convertNullString(val), z.coerce.boolean().nullable())
    .describe("Search recursively. (default: true)"),
  expandDirectories: z
    .preprocess((val) => convertNullString(val), z.coerce.boolean().nullable())
    .describe("Automatically expand directories to files. (default: true)"),
  ignoreFiles: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .describe("Glob patterns to look for ignore files. (default: undefined)"),
  cwd: z
    .preprocess((val) => convertNullString(val), z.coerce.string().nullable())
    .describe("Current working directory override. (default: process.cwd())"),
  maxResults: z
    .preprocess((val) => convertNullString(val), z.coerce.number().nullable())
    .describe(
      "Maximum number of files to return. Set to 0 for no limit. (Default: 100)",
    ),
});

type GlobInputSchema = z.infer<typeof inputSchema>;

export const createGlobTool = () => {
  return {
    toolDef: {
      description: `Search for files using glob patterns (e.g., [1m*.ts[0m, [1m**/*.test.ts[0m, [1msrc/**/*.js[0m). Uses the fast-glob library with support for .gitignore, recursive searching, directory expansion, and automatic result limiting to prevent overwhelming output. Default limit is ${DEFAULT_MAX_RESULTS} files. Use maxResults parameter to override this limit.`,
      inputSchema,
    },
    display({ patterns, path }: GlobInputSchema) {
      const patternArray = Array.isArray(patterns) ? patterns : [patterns];
      const patternStr =
        patternArray.length === 1
          ? patternArray[0]
          : JSON.stringify(patternArray);
      return `\n> ${style.cyan(patternStr)} in ${style.cyan(path)}`;
    },
    async *execute(
      {
        patterns,
        path,
        gitignore,
        recursive,
        expandDirectories,
        ignoreFiles,
        cwd,
        maxResults,
      }: GlobInputSchema,
      { toolCallId, abortSignal }: ToolExecutionOptions,
    ): AsyncGenerator<ToolResult> {
      // Check if execution has been aborted
      if (abortSignal?.aborted) {
        throw new Error("Glob search aborted");
      }

      try {
        const patternArray = Array.isArray(patterns) ? patterns : [patterns];

        // Build glob options
        const globOptions: Record<string, unknown> = {
          cwd: cwd || process.cwd(),
        };

        if (gitignore !== null) {
          globOptions["gitignore"] = gitignore;
        }

        if (recursive !== null) {
          globOptions["recursive"] = recursive;
        }

        if (expandDirectories !== null) {
          globOptions["expandDirectories"] = expandDirectories;
        }

        if (ignoreFiles !== null) {
          globOptions["ignoreFiles"] = ignoreFiles;
        }

        // Execute glob search
        const matchingFiles = await glob(patternArray, {
          ...globOptions,
          cwd: path,
        });

        // Get file stats and sort by recency then alphabetically
        const filesWithStats = await Promise.all(
          matchingFiles.map(async (filePath) => {
            const fullPath = nodePath.join(path, filePath);
            try {
              const stats = await fs.promises.stat(fullPath);
              return {
                path: filePath,
                mtime: stats.mtime,
                isRecent:
                  Date.now() - stats.mtime.getTime() < 7 * 24 * 60 * 60 * 1000, // 7 days
              };
            } catch {
              // If stat fails, treat as old file
              return {
                path: filePath,
                mtime: new Date(0),
                isRecent: false,
              };
            }
          }),
        );

        // Sort files: recent files first (newest to oldest), then older files alphabetically
        const sortedFiles = filesWithStats
          .sort((a, b) => {
            // Recent files come first
            if (a.isRecent && !b.isRecent) return -1;
            if (!a.isRecent && b.isRecent) return 1;

            // Both recent: sort by modification time (newest first)
            if (a.isRecent && b.isRecent) {
              return b.mtime.getTime() - a.mtime.getTime();
            }

            // Both old: sort alphabetically by path
            return a.path.localeCompare(b.path);
          })
          .map((file) => file.path);

        // Set default limits
        const effectiveMaxResults = maxResults ?? DEFAULT_MAX_RESULTS;

        // Apply maxResults limit
        const limitedFiles =
          effectiveMaxResults && effectiveMaxResults > 0
            ? sortedFiles.slice(0, effectiveMaxResults)
            : sortedFiles;

        // Format results
        const resultContent =
          limitedFiles.length > 0
            ? limitedFiles.join("\n")
            : "No files found matching the specified patterns.";

        // Build completion message with warning if results were truncated
        const fileCount = sortedFiles.length;
        const returnedCount = limitedFiles.length;
        let completionMessage = `Found ${style.cyan(fileCount)} files`;

        if (returnedCount < fileCount) {
          completionMessage += ` (showing ${style.cyan(returnedCount)} due to maxResults limit)`;
        }

        yield {
          name: GlobTool.name,
          event: "tool-completion",
          id: toolCallId,
          data: completionMessage,
        };

        yield resultContent;
      } catch (error) {
        yield {
          name: GlobTool.name,
          event: "tool-error",
          id: toolCallId,
          data: (error as Error).message,
        };
        yield (error as Error).message;
      }
    },
  };
};
