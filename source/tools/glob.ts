import * as fs from "node:fs";
import * as nodePath from "node:path";
import { z } from "zod";
import style from "../terminal/style.ts";
import { toDisplayPath } from "../utils/filesystem/path-display.ts";
import { glob, type Options } from "../utils/glob.ts";
import { convertNullString } from "../utils/zod.ts";
import type { ToolExecutionOptions } from "./types.ts";

const DEFAULT_MAX_RESULTS = 100;
const MAX_STAT_FILES = 1000;

interface FileWithStats {
  path: string;
  mtime: number;
}

async function getFileWithStats(
  filePath: string,
  effectivePath: string,
): Promise<FileWithStats> {
  const fullPath = nodePath.join(effectivePath, filePath);
  try {
    const stats = await fs.promises.stat(fullPath);
    return {
      path: filePath,
      mtime: stats.mtime.getTime(),
    };
  } catch {
    return {
      path: filePath,
      mtime: 0,
    };
  }
}

function sortFilesByMtime(files: FileWithStats[]): string[] {
  return files
    .sort((a, b) => {
      if (b.mtime !== a.mtime) {
        return b.mtime - a.mtime;
      }
      return a.path.localeCompare(b.path);
    })
    .map((file) => file.path);
}

function formatResult(sortedFiles: string[]): string {
  return sortedFiles.length > 0
    ? sortedFiles.join("\n")
    : "No files found matching the specified patterns.";
}

function normalizePatternArray(patterns: string | string[]): string[] {
  return Array.isArray(patterns) ? patterns : [patterns];
}

function buildGlobOptions(
  effectivePath: string,
  gitignore: boolean | null,
  recursive: boolean | null,
  expandDirectories: boolean | null,
  ignoreFiles: string | string[] | null,
  cwd: string | null,
): Options {
  return {
    cwd: cwd || effectivePath,
    ...(gitignore !== null && { gitignore }),
    ...(recursive !== null && { recursive }),
    ...(expandDirectories !== null && { expandDirectories }),
    ...(ignoreFiles !== null && { ignoreFiles }),
  };
}

function limitResults(
  sortedFiles: string[],
  effectiveMaxResults: number,
): string[] {
  if (effectiveMaxResults > 0 && sortedFiles.length > effectiveMaxResults) {
    return sortedFiles.slice(0, effectiveMaxResults);
  }
  return sortedFiles;
}

export const GlobTool = {
  name: "Glob" as const,
};

export const inputSchema = z.object({
  patterns: z
    .preprocess(
      (val) => {
        if (val === null || val === undefined) {
          return "**/*";
        }
        if (typeof val === "string") {
          const trimmed = val.trim();
          if (trimmed.startsWith("[")) {
            try {
              const parsed: unknown = JSON.parse(trimmed);
              if (Array.isArray(parsed)) {
                return parsed;
              }
            } catch {
              // Not valid JSON, treat as a plain glob string
            }
          }
        }
        return val;
      },
      z.union([z.string(), z.array(z.string())]),
    )
    .describe(
      "Glob patterns to search for (e.g., '*.ts', '**/*.test.ts', 'src/**/*.js')",
    ),
  path: z
    .preprocess(
      (val) => (val === null || val === undefined ? process.cwd() : val),
      z.string(),
    )
    .describe("Base directory to search in"),
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
      if (typeof converted === "string") {
        const trimmed = converted.trim();
        if (trimmed.startsWith("[")) {
          try {
            const parsed: unknown = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              return parsed;
            }
          } catch {
            // Not valid JSON, treat as a plain string
          }
        }
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
      description: "Find files by name pattern (e.g., *.ts).",
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

      const effectivePath =
        typeof path === "string" && path.trim() !== "" ? path : process.cwd();

      const patternArray = normalizePatternArray(patterns);
      const effectiveMaxResults = maxResults ?? DEFAULT_MAX_RESULTS;

      const globOptions = buildGlobOptions(
        effectivePath,
        gitignore,
        recursive,
        expandDirectories,
        ignoreFiles,
        cwd,
      );

      const matchingFiles = await glob(patternArray, globOptions);

      const filesToStat =
        matchingFiles.length > MAX_STAT_FILES
          ? matchingFiles.slice(0, MAX_STAT_FILES)
          : matchingFiles;

      const filesWithStats = await Promise.all(
        filesToStat.map((filePath) =>
          getFileWithStats(filePath, effectivePath),
        ),
      );

      const sortedFiles = sortFilesByMtime(filesWithStats);
      const result = limitResults(sortedFiles, effectiveMaxResults);

      return formatResult(result);
    },
  };
};
