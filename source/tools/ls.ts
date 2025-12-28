import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import style from "../terminal/style.ts";

import { isDirectory } from "../utils/filesystem/operations.ts";
import { validatePath } from "../utils/filesystem/security.ts";
import { convertNullString } from "../utils/zod.ts";
import type { ToolExecutionOptions, ToolResult } from "./types.ts";

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
    async *execute(
      { path: providedPath, limit }: LsInputSchema,
      { toolCallId, abortSignal }: ToolExecutionOptions,
    ): AsyncGenerator<ToolResult> {
      try {
        // Check if execution has been aborted
        if (abortSignal?.aborted) {
          throw new Error("Directory listing aborted");
        }

        const dirPath = providedPath ?? ".";
        const effectiveLimit = limit ?? DEFAULT_ENTRY_LIMIT;

        yield {
          name: LsTool.name,
          id: toolCallId,
          event: "tool-init",
          data: `Listing ${style.cyan(dirPath)} (limit: ${effectiveLimit})`,
        };

        // Validate and resolve the path
        const resolvedPath = await validatePath(
          path.resolve(workingDir, dirPath),
          allowedDirectory,
          { requireExistence: true, abortSignal },
        );

        if (abortSignal?.aborted) {
          throw new Error("Directory listing aborted before validation");
        }

        // Check if path is a directory
        const isDir = await isDirectory(resolvedPath);
        if (!isDir) {
          const errorMsg = `Not a directory: ${resolvedPath}`;
          yield {
            name: LsTool.name,
            event: "tool-error",
            id: toolCallId,
            data: errorMsg,
          };
          yield errorMsg;
          return;
        }

        // Read directory entries
        let entries: string[];
        try {
          entries = await fs.readdir(resolvedPath);
        } catch (e: unknown) {
          const errorMsg = `Cannot read directory: ${(e as Error).message}`;
          yield {
            name: LsTool.name,
            event: "tool-error",
            id: toolCallId,
            data: errorMsg,
          };
          yield errorMsg;
          return;
        }

        // Sort alphabetically (case-insensitive)
        entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        // Format entries with directory indicators
        const results: string[] = [];
        let entryLimitReached = false;

        for (const entry of entries) {
          if (results.length >= effectiveLimit) {
            entryLimitReached = true;
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
            // Skip entries we can't stat
            continue;
          }

          results.push(entry + suffix);
        }

        if (results.length === 0) {
          yield {
            name: LsTool.name,
            event: "tool-completion",
            id: toolCallId,
            data: "(empty directory)",
          };
          yield "(empty directory)";
          return;
        }

        // Prepare output
        const rawOutput = results.join("\n");

        // Build completion message
        const entryCount = results.length;
        let completionMessage = `Listed ${style.cyan(entryCount)} entr${entryCount === 1 ? "y" : "ies"}`;

        if (entryLimitReached) {
          completionMessage += ` (${effectiveLimit} limit reached)`;
        }

        yield {
          name: LsTool.name,
          event: "tool-completion",
          id: toolCallId,
          data: completionMessage,
        };
        yield rawOutput;
      } catch (error) {
        const errorMsg = (error as Error).message;
        let userFriendlyError = errorMsg;

        // Provide more helpful error messages for common cases
        if (
          errorMsg.includes("no such file or directory") ||
          errorMsg.includes("ENOENT")
        ) {
          userFriendlyError = `Path not found: "${providedPath ?? "."}"`;
        } else if (
          errorMsg.includes("permission denied") ||
          errorMsg.includes("EACCES")
        ) {
          userFriendlyError = `Permission denied accessing "${providedPath ?? "."}"`;
        }

        yield {
          name: LsTool.name,
          event: "tool-error",
          id: toolCallId,
          data: userFriendlyError,
        };
        yield errorMsg;
      }
    },
  };
};
