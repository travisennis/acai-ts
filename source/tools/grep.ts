import { execSync } from "node:child_process";
import { inspect } from "node:util";
import { tool } from "ai";
import { z } from "zod";
import { config } from "../config.ts";
import style from "../terminal/style.ts";
import { manageOutput, type TokenCounter } from "../token-utils.ts";
import type { SendData } from "./types.ts";

export const GrepTool = {
  name: "grepFiles" as const,
};

export const createGrepTool = (options: {
  sendData?: SendData | undefined;
  tokenCounter: TokenCounter;
}) => {
  const { sendData, tokenCounter } = options;
  return {
    [GrepTool.name]: tool({
      description: `Search files for patterns using ripgrep (rg). Uses glob patterns for file filtering (e.g., "*.ts", "**/*.test.ts"). Auto-detects unbalanced regex patterns and falls back to fixed-string search for safety.`,
      inputSchema: z.object({
        pattern: z
          .string()
          .describe(
            "The search pattern (regex by default, or fixed-string if literal=true or auto-detected as unbalanced)",
          ),
        path: z.string().describe("The path to search in"),
        recursive: z.coerce
          .boolean()
          .nullable()
          .describe("Search recursively. (default: true))"),
        ignoreCase: z.coerce
          .boolean()
          .nullable()
          .describe("Use case-sensitive search. (default: false)"),
        filePattern: z
          .string()
          .nullable()
          .describe(
            "Glob pattern to filter files (e.g., '*.ts', '**/*.test.js'). (Default: no filtering)",
          ),
        contextLines: z.coerce
          .number()
          .nullable()
          .describe(
            "The number of context lines needed in search results. (Default: 0)",
          ),
        searchIgnored: z.coerce
          .boolean()
          .nullable()
          .describe("Search ignored files. (Default: false)"),
        literal: z.coerce
          .boolean()
          .nullable()
          .describe(
            "Pass true for fixed-string search (-F), false for regex, (Default: auto-detects unbalanced patterns like mismatched parentheses/brackets.)",
          ),
      }),
      execute: async (
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
        { toolCallId, abortSignal },
      ) => {
        // Check if execution has been aborted
        if (abortSignal?.aborted) {
          throw new Error("Grep search aborted");
        }
        try {
          // grok doesn't follow my instructions
          const safeFilePattern = filePattern === "null" ? null : filePattern;
          sendData?.({
            event: "tool-init",
            id: toolCallId,
            data: `Searching codebase for ${style.cyan(inspect(pattern))}${safeFilePattern ? ` with file pattern ${style.cyan(safeFilePattern)}` : ""} in ${style.cyan(path)}`,
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
                  data: {
                    primary:
                      "Pattern appears to contain unbalanced regex metacharacters; using fixed-string mode (-F).",
                  },
                });
              } else {
                effectiveLiteral = false;
              }
            } catch (_err) {
              effectiveLiteral = false;
            }
          }

          const rawResult = grepFiles(pattern, path, {
            recursive,
            ignoreCase,
            filePattern: safeFilePattern,
            contextLines,
            searchIgnored,
            literal: effectiveLiteral,
          });

          const maxTokens = (await config.readProjectConfig()).tools.maxTokens;

          const managed = manageOutput(rawResult, {
            tokenCounter,
            threshold: maxTokens,
          });

          if (managed.truncated) {
            sendData?.({
              event: "tool-update",
              id: toolCallId,
              data: { primary: managed.warning },
            });
          }

          const matchCount =
            managed.content === "No matches found."
              ? 0
              : managed.content
                  .trim()
                  .split("\n")
                  .filter((line: string) => {
                    if (line === "--") {
                      return false;
                    }
                    return /^(.+?):(\d+):(.*)$/.test(line);
                  }).length;

          sendData?.({
            event: "tool-completion",
            id: toolCallId,
            data: `Found ${style.cyan(matchCount)} matches. (${managed.tokenCount} tokens)`,
          });
          return Promise.resolve(managed.content);
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
export function buildGrepCommand(
  pattern: string,
  path: string,
  options: GrepOptions = {},
): string {
  const effectiveRecursive =
    options.recursive === null ? true : options.recursive;
  const effectiveIgnoreCase =
    options.ignoreCase === null ? false : options.ignoreCase;
  const effectiveSearchIgnored =
    options.searchIgnored === null ? false : options.searchIgnored;
  const effectiveFilePattern = options.filePattern;
  const effectiveContextLines = options.contextLines;

  // Determine literal handling: if options.literal is explicitly provided, use it.
  // If null/undefined, auto-detect unbalanced regexes and prefer fixed-strings.
  let effectiveLiteral: boolean;
  if (options.literal === true) {
    effectiveLiteral = true;
  } else if (options.literal === false) {
    effectiveLiteral = false;
  } else {
    effectiveLiteral = likelyUnbalancedRegex(pattern);
  }

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

  return command;
}

function grepFiles(
  pattern: string,
  path: string,
  options: GrepOptions = {},
): string {
  try {
    const command = buildGrepCommand(pattern, path, options);
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
