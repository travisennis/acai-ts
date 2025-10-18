import * as fs from "node:fs";
import * as nodePath from "node:path";
import { inspect } from "node:util";
import type { ToolCallOptions } from "ai";
import { z } from "zod";
import { config } from "../config.ts";
import style from "../terminal/style.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import { manageOutput } from "../tokens/manage-output.ts";
import { glob } from "../utils/glob.ts";
import type { ToolResult } from "./types.ts";

export const GlobTool = {
  name: "globFiles" as const,
};

export const inputSchema = z.object({
  patterns: z
    .union([z.string(), z.array(z.string())])
    .describe(
      "Glob patterns to search for (e.g., '*.ts', '**/*.test.ts', 'src/**/*.js')",
    ),
  path: z.string().describe("Base directory to search in"),
  gitignore: z.coerce
    .boolean()
    .nullable()
    .describe("Respect ignore patterns in .gitignore files. (default: true)"),
  recursive: z.coerce
    .boolean()
    .nullable()
    .describe("Search recursively. (default: true)"),
  expandDirectories: z.coerce
    .boolean()
    .nullable()
    .describe("Automatically expand directories to files. (default: true)"),
  ignoreFiles: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .describe("Glob patterns to look for ignore files. (default: undefined)"),
  cwd: z.coerce
    .string()
    .nullable()
    .describe("Current working directory override. (default: process.cwd())"),
});

export type GlobInputSchema = z.infer<typeof inputSchema>;

export const createGlobTool = (options: { tokenCounter: TokenCounter }) => {
  const { tokenCounter } = options;

  return {
    toolDef: {
      description:
        "Search for files using glob patterns (e.g., `*.ts`, `**/*.test.ts`, `src/**/*.js`). Uses the fast-glob library with support for gitignore, recursive searching, and directory expansion.",
      inputSchema,
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
      }: GlobInputSchema,
      { toolCallId, abortSignal }: ToolCallOptions,
    ): AsyncGenerator<ToolResult> {
      // Check if execution has been aborted
      if (abortSignal?.aborted) {
        throw new Error("Glob search aborted");
      }

      try {
        const patternArray = Array.isArray(patterns) ? patterns : [patterns];

        yield {
          event: "tool-init",
          id: toolCallId,
          data: `Searching for files matching ${style.cyan(inspect(patternArray))} in ${style.cyan(path)}`,
        };

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

        const maxTokens = (await config.readProjectConfig()).tools.maxTokens;

        // Format results
        const resultContent =
          sortedFiles.length > 0
            ? sortedFiles.join("\n")
            : "No files found matching the specified patterns.";

        const managed = manageOutput(resultContent, {
          tokenCounter,
          threshold: maxTokens,
        });

        if (managed.truncated) {
          yield {
            event: "tool-update",
            id: toolCallId,
            data: { primary: managed.warning },
          };
        }

        // Show file count and sample files
        if (sortedFiles.length > 0) {
          const sampleFiles = sortedFiles.slice(0, 10);

          yield {
            event: "tool-update",
            id: toolCallId,
            data: {
              primary: `Found ${style.cyan(sortedFiles.length)} files. First ${sampleFiles.length} files:`,
              secondary: sampleFiles,
            },
          };
        }

        yield {
          event: "tool-completion",
          id: toolCallId,
          data: `Glob search completed. Found ${style.cyan(sortedFiles.length)} files. (${managed.tokenCount} tokens)`,
        };

        yield managed.content;
      } catch (error) {
        yield {
          event: "tool-error",
          id: toolCallId,
          data: `Error searching for files with patterns "${patterns}" in ${path}`,
        };
        yield (error as Error).message;
      }
    },
  };
};
