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
          .optional()
          .default(true)
          .describe("Whether to search recursively"),
        ignoreCase: z
          .boolean()
          .optional()
          .default(false)
          .describe("Whether to ignore case"),
        filePattern: z
          .string()
          .optional()
          .describe("Optional pattern to filter files to search"),
        contextLines: z
          .number()
          .optional()
          .describe("Number of lines of context to show"),
        searchIgnored: z
          .boolean()
          .optional()
          .default(false)
          .describe("Whether to search ignored files and directories"),
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
            data: `Found results:\n${result}`,
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
  recursive?: boolean | undefined;
  ignoreCase?: boolean | undefined;
  filePattern?: string | undefined;
  contextLines?: number | undefined;
  searchIgnored?: boolean | undefined;
}

/**
 * Search files for patterns using ripgrep
 *
 * @param pattern - The regex pattern to search for
 * @param path - The path to search in
 * @param options - Additional options for the grep command
 * @returns The result of the grep command
 */
export function grepFiles(
  pattern: string,
  path: string,
  options: GrepOptions = {},
): string {
  try {
    const {
      recursive = true,
      ignoreCase = false,
      filePattern,
      contextLines,
      searchIgnored = false,
    } = options;

    // Build the ripgrep command
    let command = "rg --line-number";

    // Ripgrep is recursive by default, so we only need to add
    // --no-recursive if recursive is false
    if (recursive === false) {
      command += " --no-recursive";
    }

    if (ignoreCase) {
      command += " --ignore-case";
    }

    if (contextLines !== undefined) {
      command += ` --context=${contextLines}`;
    }

    // Add pattern (escaped for shell)
    command += ` ${JSON.stringify(pattern)}`;

    // Add path
    command += ` ${path}`;

    // Add file pattern if specified
    if (filePattern) {
      command += ` --glob=${JSON.stringify(filePattern)}`;
    }

    if (searchIgnored) {
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
