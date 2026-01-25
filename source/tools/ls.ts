import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import style from "../terminal/style.ts";

import { isDirectory } from "../utils/filesystem/operations.ts";
import { toDisplayPath } from "../utils/filesystem/path-display.ts";
import { validatePath } from "../utils/filesystem/security.ts";
import { convertNullString } from "../utils/zod.ts";
import type { ToolExecutionOptions } from "./types.ts";

export const LsTool = {
  name: "LS" as const,
};

const inputSchema = z.object({
  path: z
    .string()
    .optional()
    .describe("Directory to list (default: current directory)"),
  limit: z
    .preprocess((val) => convertNullString(val), z.coerce.number().nullable())
    .describe("Maximum number of entries to return (default: 500)"),
});

type LsInputSchema = z.infer<typeof inputSchema>;

const DEFAULT_ENTRY_LIMIT = 500;

export const createLsTool = async (options: {
  workingDir: string;
  allowedDirs?: string[];
}) => {
  const { workingDir, allowedDirs } = options;
  const allowedDirectory = allowedDirs ?? [workingDir];

  return {
    toolDef: {
      description: `List directory contents. Returns entries sorted alphabetically, with '/' suffix for directories. Includes dotfiles. Output is limited to ${DEFAULT_ENTRY_LIMIT} entries by default. Use the limit parameter to adjust.`,
      inputSchema,
    },
    display({ path: providedPath, limit }: LsInputSchema) {
      const dirPath = providedPath ?? ".";
      const effectiveLimit = limit ?? 500;
      const displayPath = toDisplayPath(dirPath);
      return `${style.cyan(displayPath)} (limit: ${effectiveLimit})`;
    },
    async execute(
      { path: providedPath, limit }: LsInputSchema,
      { abortSignal }: ToolExecutionOptions,
    ): Promise<string> {
      if (abortSignal?.aborted) {
        throw new Error("Directory listing aborted");
      }

      const dirPath = providedPath ?? ".";
      const effectiveLimit = limit ?? DEFAULT_ENTRY_LIMIT;

      const resolvedPath = await validatePath(
        path.resolve(workingDir, dirPath),
        allowedDirectory,
        { requireExistence: true, abortSignal },
      );

      if (abortSignal?.aborted) {
        throw new Error("Directory listing aborted before validation");
      }

      const isDir = await isDirectory(resolvedPath);
      if (!isDir) {
        throw new Error(`Not a directory: ${resolvedPath}`);
      }

      let entries: string[];
      try {
        entries = await fs.readdir(resolvedPath);
      } catch (e: unknown) {
        throw new Error(`Cannot read directory: ${(e as Error).message}`);
      }

      entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

      const results: string[] = [];

      for (const entry of entries) {
        if (results.length >= effectiveLimit) {
          break;
        }

        const fullPath = path.join(resolvedPath, entry);
        let suffix = "";

        try {
          const entryStat = await fs.stat(fullPath);
          if (entryStat.isDirectory()) {
            suffix = "/";
          }
        } catch {
          continue;
        }

        results.push(entry + suffix);
      }

      if (results.length === 0) {
        return "(empty directory)";
      }

      return results.join("\n");
    },
  };
};
