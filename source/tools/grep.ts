import { tool } from "ai";
import { z } from "zod";
import { execSync } from "node:child_process";
import type { SendData } from "./types.ts";

export const createGrepTools = (options: { sendData?: SendData } = {}) => {
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
      }),
      execute: ({
        pattern,
        path,
        recursive,
        ignoreCase,
        filePattern,
        contextLines,
      }) => {
        try {
          sendData?.({
            event: "tool-init",
            data: `Searching for "${pattern}" in ${path}`,
          });
          return Promise.resolve(
            grepFiles(pattern, path, {
              recursive,
              ignoreCase,
              filePattern,
              contextLines,
            }),
          );
        } catch (error) {
          sendData?.({
            event: "tool-error",
            data: `Error searching for "${pattern}" in ${path}`,
          });
          return Promise.resolve((error as Error).message);
        }
      },
    }),
  };
};

interface GrepOptions {
  recursive?: boolean;
  ignoreCase?: boolean;
  filePattern?: string;
  contextLines?: number;
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
    } = options;

    // Build the ripgrep command
    let command = "rg";

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
