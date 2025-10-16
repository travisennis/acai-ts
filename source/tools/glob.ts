import { inspect } from "node:util";
import type { ToolCallOptions } from "ai";
import { z } from "zod";
import { config } from "../config.ts";
import style from "../terminal/style.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import { manageOutput } from "../tokens/manage-output.ts";
import { glob } from "../utils/glob.ts";
import type { Message } from "./types.ts";

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
    .describe("Respect ignore patterns in .gitignore files. (default: false)"),
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
  cwd: z
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
    ): AsyncGenerator<Message, string> {
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

        const maxTokens = (await config.readProjectConfig()).tools.maxTokens;

        // Format results
        const resultContent =
          matchingFiles.length > 0
            ? matchingFiles.join("\n")
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
        if (matchingFiles.length > 0) {
          const sampleFiles = matchingFiles.slice(0, 10);

          yield {
            event: "tool-update",
            id: toolCallId,
            data: {
              primary: `Found ${style.cyan(matchingFiles.length)} files. First ${sampleFiles.length} files:`,
              secondary: sampleFiles,
            },
          };
        }

        yield {
          event: "tool-completion",
          id: toolCallId,
          data: `Glob search completed. Found ${style.cyan(matchingFiles.length)} files. (${managed.tokenCount} tokens)`,
        };

        return managed.content;
      } catch (error) {
        yield {
          event: "tool-error",
          id: toolCallId,
          data: `Error searching for files with patterns "${patterns}" in ${path}`,
        };
        return (error as Error).message;
      }
    },
  };
};
