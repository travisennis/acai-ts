import { execSync } from "node:child_process";
import { inspect } from "node:util";
import type { ToolCallOptions } from "ai";
import { z } from "zod";
import { config } from "../config.ts";
import style from "../terminal/style.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import { manageOutput } from "../tokens/manage-output.ts";
import type { ToolResult } from "./types.ts";

export const GrepTool = {
  name: "grepFiles" as const,
};

const inputSchema = z.object({
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
  filePattern: z.coerce
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
});

export type GrepInputSchema = z.infer<typeof inputSchema>;

export const createGrepTool = (options: { tokenCounter: TokenCounter }) => {
  const { tokenCounter } = options;

  return {
    toolDef: {
      description: `Search files for patterns using ripgrep (rg). Uses glob patterns for file filtering (e.g., "*.ts", "**/*.test.ts"). Auto-detects unbalanced regex patterns and falls back to fixed-string search for safety.`,
      inputSchema,
    },
    async *execute(
      {
        pattern,
        path,
        recursive,
        ignoreCase,
        filePattern,
        contextLines,
        searchIgnored,
        literal,
      }: GrepInputSchema,
      { toolCallId, abortSignal }: ToolCallOptions,
    ): AsyncGenerator<ToolResult> {
      // Check if execution has been aborted
      if (abortSignal?.aborted) {
        throw new Error("Grep search aborted");
      }

      try {
        // grok doesn't follow my instructions
        const safeFilePattern = filePattern === "null" ? null : filePattern;
        yield {
          event: "tool-init",
          id: toolCallId,
          data: `Searching codebase for ${style.cyan(inspect(pattern))}${safeFilePattern ? ` with file pattern ${style.cyan(safeFilePattern)}` : ""} in ${style.cyan(path)}`,
        };

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
              yield {
                event: "tool-update",
                id: toolCallId,
                data: {
                  primary:
                    "Pattern appears to contain unbalanced regex metacharacters; using fixed-string mode (-F).",
                },
              };
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
          yield {
            event: "tool-update",
            id: toolCallId,
            data: { primary: managed.warning },
          };
        }

        // Extract and filter matches from the content
        const extractMatches = (content: string): string[] => {
          if (content === "No matches found.") {
            return [];
          }
          return content
            .trim()
            .split("\n")
            .filter((line: string) => {
              if (line === "--") {
                return false;
              }
              return /^(.+?):(\d+):(.*)$/.test(line);
            });
        };

        const matches = extractMatches(managed.content);
        const matchCount = matches.length;

        // Show the last 10 matches as a preview
        if (matchCount > 0) {
          const previewMatches = matches.slice(-10); // Get last 10 matches

          yield {
            event: "tool-update",
            id: toolCallId,
            data: {
              primary: `Last ${previewMatches.length} matches:`,
              secondary: previewMatches,
            },
          };
        }

        yield {
          event: "tool-completion",
          id: toolCallId,
          data: `Found ${style.cyan(matchCount)} matches. (${managed.tokenCount} tokens)`,
        };
        yield managed.content;
      } catch (error) {
        yield {
          event: "tool-error",
          id: toolCallId,
          data: `Error searching for "${pattern}" in ${path}: ${(error as Error).message}`,
        };
        yield (error as Error).message;
      }
    },
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

interface ExecSyncError extends Error {
  status?: number;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
}

export function likelyUnbalancedRegex(pattern: string): boolean {
  const counts = {
    openParen: 0,
    closeParen: 0,
    openBracket: 0,
    closeBracket: 0,
    openBrace: 0,
    closeBrace: 0,
  };
  let escaped = false;
  let inCharacterClass = false;

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

    // Track character class boundaries
    if (ch === "[" && !inCharacterClass) {
      inCharacterClass = true;
      counts.openBracket++;
      continue;
    }

    if (ch === "]" && inCharacterClass) {
      inCharacterClass = false;
      counts.closeBracket++;
      continue;
    }

    // Only count brackets/parens/braces outside of character classes
    if (!inCharacterClass) {
      switch (ch) {
        case "(":
          counts.openParen++;
          break;
        case ")":
          counts.closeParen++;
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
  }

  // Check for unbalanced brackets, parentheses, and braces
  const hasUnbalancedBrackets = counts.openBracket !== counts.closeBracket;
  const hasUnbalancedParens = counts.openParen !== counts.closeParen;
  const hasUnbalancedBraces = counts.openBrace !== counts.closeBrace;

  // Also check for invalid repetition operators (e.g., {n}, {n,}, {n,m}) outside of character classes
  let hasInvalidRepetition = false;
  {
    let escaped2 = false;
    let inClass2 = false;
    for (let i = 0; i < pattern.length; i++) {
      const ch = pattern[i];
      if (escaped2) {
        escaped2 = false;
        continue;
      }
      if (ch === "\\") {
        escaped2 = true;
        continue;
      }
      if (ch === "[" && !inClass2) {
        inClass2 = true;
        continue;
      }
      if (ch === "]" && inClass2) {
        inClass2 = false;
        continue;
      }
      if (inClass2) {
        continue;
      }
      if (ch === "{") {
        let j = i + 1;
        let hasDigits = false;
        let hasComma = false;
        while (j < pattern.length && pattern[j] !== "}") {
          const c = pattern[j];
          if (c >= "0" && c <= "9") {
            hasDigits = true;
          } else if (c === "," && !hasComma) {
            hasComma = true;
          } else {
            break;
          }
          j++;
        }
        if (j >= pattern.length || pattern[j] !== "}") {
          hasInvalidRepetition = true;
          break;
        }
        // At this point we have a closing brace at j
        if (!hasDigits) {
          // Heuristic: treat empty {} as non-quantifier when it doesn't follow a likely atom
          const prev = i > 0 ? pattern[i - 1] : undefined;
          if (prev !== undefined && /\S/.test(prev)) {
            hasInvalidRepetition = true;
            break;
          }
          // else ignore as literal braces
        }
      }
    }
  }

  return (
    hasUnbalancedBrackets ||
    hasUnbalancedParens ||
    hasUnbalancedBraces ||
    hasInvalidRepetition
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
  command += ` ${JSON.stringify(path)}`;

  return command;
}

export function grepFiles(
  pattern: string,
  path: string,
  options: GrepOptions = {},
): string {
  try {
    const command = buildGrepCommand(pattern, path, options);
    const result = execSync(command, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result;
  } catch (error) {
    const execError = error as ExecSyncError;
    const exitCode = execError?.status;

    if (exitCode === 1) {
      return "No matches found.";
    }

    if (exitCode === 2) {
      const stderrStr =
        typeof execError.stderr === "string"
          ? execError.stderr
          : (execError.stderr?.toString("utf-8") ?? execError.message);
      throw new Error(
        `Regex parse error in pattern "${pattern}": ${stderrStr}`,
      );
    }

    throw new Error(`Error executing ripgrep: ${execError.message}`);
  }
}
