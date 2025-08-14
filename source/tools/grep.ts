import { execSync } from "node:child_process";
import { inspect } from "node:util";
import { tool } from "ai";
import chalk from "chalk";
import { z } from "zod";
import type { SendData } from "./types.ts";

export const GrepTool = {
  name: "grepFiles" as const,
};

export const createGrepTool = (
  options: { sendData?: SendData | undefined } = {},
) => {
  const { sendData } = options;
  return {
    [GrepTool.name]: tool({
      description: "Search files for patterns using ripgrep",
      inputSchema: z.object({
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
        literal: z
          .boolean()
          .nullable()
          .describe(
            "Pass true to search as a fixed string (no regex). Pass null to auto-detect.",
          ),
      }),
      execute: (
        {
          pattern,
          path,
          recursive,
          ignoreCase,
          filePattern,
          contextLines,
          searchIgnored,
          literal,
        },
        { toolCallId },
      ) => {
        try {
          sendData?.({
            event: "tool-init",
            id: toolCallId,
            data: `Searching codebase for "${chalk.cyan(inspect(pattern))}" in ${chalk.cyan(path)}`,
          });

          // Normalize literal option: if null => auto-detect using heuristic
          let effectiveLiteral: boolean | null = null;
          if (literal === true) {
            effectiveLiteral = true;
          } else if (literal === false) {
            effectiveLiteral = false;
          } else {
            // auto-detect
            try {
              if (likelyUnbalancedRegex(pattern)) {
                effectiveLiteral = true;
                sendData?.({
                  event: "tool-update",
                  id: toolCallId,
                  data: "Pattern appears to contain unbalanced regex metacharacters; using fixed-string mode (-F).",
                });
              } else {
                effectiveLiteral = false;
              }
            } catch (_err) {
              effectiveLiteral = false;
            }
          }

          const result = grepFiles(pattern, path, {
            recursive,
            ignoreCase,
            filePattern,
            contextLines,
            searchIgnored,
            literal: effectiveLiteral,
          });

          const matchCount =
            result === "No matches found."
              ? 0
              : result
                  .trim()
                  .split("\n")
                  .filter((line) => {
                    if (line === "--") {
                      return false;
                    }
                    return /^(.+?):(\d+):(.*)$/.test(line);
                  }).length;

          sendData?.({
            event: "tool-completion",
            id: toolCallId,
            data: `Found ${chalk.cyan(matchCount)} matches.`,
          });
          return Promise.resolve(result);
        } catch (error) {
          sendData?.({
            event: "tool-error",
            id: toolCallId,
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
  literal?: boolean | null;
}

function likelyUnbalancedRegex(pattern: string): boolean {
  const counts = {
    openParen: 0,
    closeParen: 0,
    openBracket: 0,
    closeBracket: 0,
    openBrace: 0,
    closeBrace: 0,
  };
  let escaped = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    switch (ch) {
      case "(":
        counts.openParen++;
        break;
      case ")":
        counts.closeParen++;
        break;
      case "[":
        counts.openBracket++;
        break;
      case "]":
        counts.closeBracket++;
        break;
      case "{":
        counts.openBrace++;
        break;
      case "}":
        counts.closeBrace++;
        break;
      default:
        break;
    }
  }
  return (
    counts.openParen !== counts.closeParen ||
    counts.openBracket !== counts.closeBracket ||
    counts.openBrace !== counts.closeBrace
  );
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
    const effectiveRecursive =
      options.recursive === null ? true : options.recursive;
    const effectiveIgnoreCase =
      options.ignoreCase === null ? false : options.ignoreCase;
    const effectiveSearchIgnored =
      options.searchIgnored === null ? false : options.searchIgnored;
    const effectiveFilePattern = options.filePattern;
    const effectiveContextLines = options.contextLines;
    const effectiveLiteral =
      options.literal === null || options.literal === undefined
        ? false
        : options.literal;

    let command = "rg --line-number";

    if (effectiveRecursive === false) {
      command += " --max-depth=0";
    }

    if (effectiveIgnoreCase) {
      command += " --ignore-case";
    }

    if (effectiveContextLines !== null && effectiveContextLines !== undefined) {
      command += ` --context=${effectiveContextLines}`;
    }

    if (effectiveFilePattern !== null && effectiveFilePattern !== undefined) {
      command += ` --glob=${JSON.stringify(effectiveFilePattern)}`;
    }

    if (effectiveSearchIgnored) {
      command += " --no-ignore";
    }

    if (effectiveLiteral) {
      command += " -F";
    }

    command += ` ${JSON.stringify(pattern)}`;
    command += ` ${path}`;

    const result = execSync(command, { encoding: "utf-8" });
    return result;
  } catch (error) {
    if (
      error instanceof Error &&
      "status" in error &&
      (error as unknown as { status?: number }).status === 1
    ) {
      return "No matches found.";
    }

    throw new Error(`Error executing ripgrep: ${(error as Error).message}`);
  }
}
