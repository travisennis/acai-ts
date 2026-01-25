import * as fs from "node:fs";
import * as nodePath from "node:path";
import { z } from "zod";
import style from "../terminal/style.ts";
import { toDisplayPath } from "../utils/filesystem/path-display.ts";
import { glob } from "../utils/glob.ts";
import { convertNullString } from "../utils/zod.ts";
import type { ToolExecutionOptions } from "./types.ts";

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
    .preprocess((val) => {
      const converted = convertNullString(val);
      if (converted === null) {
        return null;
      }
      return converted;
    }, z.union([z.string(), z.array(z.string())]).nullable())
    .describe(
      "Glob patterns to look for ignore files (e.g., '.gitignore'). Pass null to use default behavior.",
    ),
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
      const displayPath = toDisplayPath(path);
      return `${style.cyan(patternStr)} in ${style.cyan(displayPath)}`;
    },
    async execute(
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
      { abortSignal }: ToolExecutionOptions,
    ): Promise<string> {
      if (abortSignal?.aborted) {
        throw new Error("Glob search aborted");
      }

      const patternArray = Array.isArray(patterns) ? patterns : [patterns];

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

      const matchingFiles = await glob(patternArray, {
        ...globOptions,
        cwd: path,
      });

      const filesWithStats = await Promise.all(
        matchingFiles.map(async (filePath) => {
          const fullPath = nodePath.join(path, filePath);
          try {
            const stats = await fs.promises.stat(fullPath);
            return {
              path: filePath,
              mtime: stats.mtime,
              isRecent:
                Date.now() - stats.mtime.getTime() < 7 * 24 * 60 * 60 * 1000,
            };
          } catch {
            return {
              path: filePath,
              mtime: new Date(0),
              isRecent: false,
            };
          }
        }),
      );

      const sortedFiles = filesWithStats
        .sort((a, b) => {
          if (a.isRecent && !b.isRecent) return -1;
          if (!a.isRecent && b.isRecent) return 1;
          if (a.isRecent && b.isRecent) {
            return b.mtime.getTime() - a.mtime.getTime();
          }
          return a.path.localeCompare(b.path);
        })
        .map((file) => file.path);

      const effectiveMaxResults = maxResults ?? DEFAULT_MAX_RESULTS;

      const limitedFiles =
        effectiveMaxResults && effectiveMaxResults > 0
          ? sortedFiles.slice(0, effectiveMaxResults)
          : sortedFiles;

      return limitedFiles.length > 0
        ? limitedFiles.join("\n")
        : "No files found matching the specified patterns.";
    },
  };
};
