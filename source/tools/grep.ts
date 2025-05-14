import { execSync } from "node:child_process";
import { tool } from "ai";
import { z } from "zod";
import type { SendData } from "./types.ts";

export const createGrepTools = (
  options: { sendData?: SendData | undefined } = {},
) => {
  const { sendData } = options;
  return {
    grepFiles: tool({
      description: "Search files for patterns using ripgrep",
      parameters: z.object({
        pattern: z.string().describe("The regex pattern to search for"),
        path: z.string().describe("The path to search in"),
        recursive: z
          .boolean()
          .nullable()
          .describe("Pass null to use the default (true, search recursively)."),
        ignoreCase: z
          .boolean()
          .nullable()
          .describe(
            "Pass null to use the default (false, case-sensitive search).",
          ),
        filePattern: z
          .string()
          .nullable()
          .describe("Pass null if no file pattern filter is needed."),
        contextLines: z
          .number()
          .nullable()
          .describe("Pass null if no context lines are needed."),
        searchIgnored: z
          .boolean()
          .nullable()
          .describe(
            "Pass null to use the default (false, don't search ignored files).",
          ),
      }),
      execute: ({
        pattern,
        path,
        recursive,
        ignoreCase,
        filePattern,
        contextLines,
        searchIgnored,
      }) => {
        const uuid = crypto.randomUUID();
        try {
          sendData?.({
            event: "tool-init",
            id: uuid,
            data: `Using ripgrep to search for "${pattern}" in ${path}`,
          });
          const result = grepFiles(pattern, path, {
            recursive,
            ignoreCase,
            filePattern,
            contextLines,
            searchIgnored,
          });

          sendData?.({
            event: "tool-completion",
            id: uuid,
            data: `Found ${result.length} results.`,
          });
          return Promise.resolve(result);
        } catch (error) {
          sendData?.({
            event: "tool-error",
            id: uuid,
            data: `Error searching for "${pattern}" in ${path}`,
          });
          return Promise.resolve((error as Error).message);
        }
      },
    }),
  };
};

interface GrepOptions {
  recursive?: boolean | null;
  ignoreCase?: boolean | null;
  filePattern?: string | null;
  contextLines?: number | null;
  searchIgnored?: boolean | null;
}

/**
 * Search files for patterns using ripgrep
 *
 * @param pattern - The regex pattern to search for
 * @param path - The path to search in
 * @param options - Additional options for the grep command
 * @returns The result of the grep command
 */
function grepFiles(
  pattern: string,
  path: string,
  options: GrepOptions = {},
): string {
  try {
    // Handle null values by providing defaults
    const effectiveRecursive =
      options.recursive === null ? true : options.recursive;
    const effectiveIgnoreCase =
      options.ignoreCase === null ? false : options.ignoreCase;
    const effectiveSearchIgnored =
      options.searchIgnored === null ? false : options.searchIgnored;
    const effectiveFilePattern = options.filePattern;
    const effectiveContextLines = options.contextLines;

    // Build the ripgrep command
    let command = "rg --line-number";

    // Ripgrep is recursive by default, so we only need to add
    // --no-recursive if effectiveRecursive is explicitly false
    if (effectiveRecursive === false) {
      command += " --max-depth=0";
    }

    if (effectiveIgnoreCase) {
      command += " --ignore-case";
    }

    if (effectiveContextLines !== null && effectiveContextLines !== undefined) {
      command += ` --context=${effectiveContextLines}`;
    }

    // Add pattern (escaped for shell)
    command += ` ${JSON.stringify(pattern)}`;

    // Add path
    command += ` ${path}`;

    // Add file pattern if specified
    if (effectiveFilePattern !== null && effectiveFilePattern !== undefined) {
      command += ` --glob=${JSON.stringify(effectiveFilePattern)}`;
    }

    if (effectiveSearchIgnored) {
      command += " --no-ignore";
    }

    // Execute the command
    const result = execSync(command, { encoding: "utf-8" });
    return result;
  } catch (error) {
    if ((error as any).status === 1) {
      // Status 1 in ripgrep just means "no matches found"
      return "No matches found.";
    }
    throw new Error(`Error executing ripgrep: ${(error as Error).message}`);
  }
}
