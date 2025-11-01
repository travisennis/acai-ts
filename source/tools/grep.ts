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
  maxResults: z.coerce
    .number()
    .nullable()
    .describe(
      "Maximum number of matches to return. Set to 0 for no limit. (Default: configured value)",
    ),
});

export type GrepInputSchema = z.infer<typeof inputSchema>;

export const createGrepTool = (options: { tokenCounter: TokenCounter }) => {
  const { tokenCounter } = options;

  return {
    toolDef: {
      description: `Search files for patterns using ripgrep (rg). Uses glob patterns for file filtering (e.g., "*.ts", "**/*.test.ts"). Auto-detects unbalanced regex patterns and falls back to fixed-string search for safety. Results are limited to prevent overwhelming output; configure via maxResults parameter.`,
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
        maxResults,
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

        // Enhanced tool-init with detailed search parameters
        let initMessage = `Grep: ${style.cyan(inspect(pattern))} in ${style.cyan(path)}`;
        if (safeFilePattern) {
          initMessage += ` ${style.dim(`(filter: ${safeFilePattern})`)}`;
        }
        if (recursive === false) {
          initMessage += ` ${style.dim("(non-recursive)")}`;
        }
        if (ignoreCase) {
          initMessage += ` ${style.dim("(case-insensitive)")}`;
        }
        if (contextLines && contextLines > 0) {
          initMessage += ` ${style.dim(`(with ${contextLines} context line${contextLines === 1 ? "" : "s"})`)}`;
        }

        yield {
          event: "tool-init",
          id: toolCallId,
          data: initMessage,
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
            } else {
              effectiveLiteral = false;
            }
          } catch (_err) {
            effectiveLiteral = false;
          }
        }

        const projectConfig = await config.readProjectConfig();
        const configMaxResults = projectConfig.tools.maxResults;
        const effectiveMaxResults = maxResults ?? configMaxResults;

        const grepResult = grepFilesStructured(pattern, path, {
          recursive,
          ignoreCase,
          filePattern: safeFilePattern,
          contextLines,
          searchIgnored,
          literal: effectiveLiteral,
          maxResults: effectiveMaxResults,
        });

        const maxTokens = projectConfig.tools.maxTokens;

        const managed = manageOutput(grepResult.rawOutput, {
          tokenCounter,
          threshold: maxTokens,
        });

        // Get actual matches (excluding context lines)
        const actualMatches = grepResult.parsedMatches.filter(
          (match) => match.isMatch && !match.isContext,
        );
        const matchCount = grepResult.matchCount;

        // Show first matches as a preview (more useful than last matches)
        if (matchCount > 0) {
          const previewCount = Math.min(8, matchCount);
          const previewMatches = actualMatches.slice(0, previewCount);
          const previewStrings = previewMatches.map((match) => {
            if (match.file) {
              return `${match.file}:${match.line}:${match.content}`;
            }
            return `${match.line}:${match.content}`;
          });

          yield {
            event: "tool-update",
            id: toolCallId,
            data: {
              primary: `Found ${matchCount} match${matchCount === 1 ? "" : "es"}${matchCount > previewCount ? ` (showing first ${previewCount})` : ""}`,
              secondary: previewStrings,
            },
          };
        } else {
          // Show search completed message even for no matches
          yield {
            event: "tool-update",
            id: toolCallId,
            data: {
              primary: "Search completed - no matches found",
            },
          };
        }

        // Enhanced completion message with detailed statistics
        let completionMessage = `Found ${style.cyan(matchCount)} match${matchCount === 1 ? "" : "es"}`;

        if (grepResult.isTruncated) {
          completionMessage += ` (showing first ${style.cyan(grepResult.displayedCount)})`;
        }

        // Calculate unique files with matches
        const filesWithMatches = new Set(
          grepResult.parsedMatches
            .filter((match) => match.isMatch && !match.isContext && match.file)
            .map((match) => match.file),
        ).size;

        if (filesWithMatches > 0) {
          completionMessage += ` across ${style.cyan(filesWithMatches)} file${filesWithMatches === 1 ? "" : "s"}`;
        }

        if (grepResult.contextCount > 0) {
          completionMessage += ` with ${style.cyan(grepResult.contextCount)} context line${grepResult.contextCount === 1 ? "" : "s"}`;
        }

        completionMessage += ` (${managed.tokenCount} tokens)`;

        yield {
          event: "tool-completion",
          id: toolCallId,
          data: completionMessage,
        };
        yield managed.content;
      } catch (error) {
        const errorMessage = (error as Error).message;
        let userFriendlyError = `Error searching for "${pattern}" in ${path}: ${errorMessage}`;

        // Provide more helpful error messages for common cases
        if (errorMessage.includes("No such file or directory")) {
          userFriendlyError = `Path not found: "${path}"`;
          if (filePattern) {
            userFriendlyError += ` with file pattern "${filePattern}"`;
          }
          userFriendlyError += " - check if the path exists and is accessible";
        } else if (errorMessage.includes("permission denied")) {
          userFriendlyError = `Permission denied accessing "${path}"`;
        } else if (errorMessage.includes("Regex parse error")) {
          userFriendlyError = `Invalid search pattern "${pattern}" - try using literal=true for fixed-string search`;
        }

        yield {
          event: "tool-error",
          id: toolCallId,
          data: userFriendlyError,
        };
        yield errorMessage;
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
  maxResults?: number | null;
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

export interface ParsedMatch {
  file?: string;
  line: number;
  content: string;
  isMatch: boolean;
  isContext?: boolean;
}

export interface GrepResult {
  rawOutput: string;
  parsedMatches: ParsedMatch[];
  matchCount: number;
  displayedCount?: number;
  contextCount: number;
  hasMatches: boolean;
  isTruncated?: boolean;
}

/**
 * Parse ripgrep output and extract structured match information
 */
export function parseRipgrepOutput(content: string): ParsedMatch[] {
  if (content === "No matches found.") {
    return [];
  }

  const lines = content.trim().split("\n");
  const parsed: ParsedMatch[] = [];

  for (const line of lines) {
    if (line === "--") {
      // Separator between file groups - skip
      continue;
    }

    if (line.trim() === "") {
      // Empty line - skip
      continue;
    }

    // Try multi-file format: file:line:content
    const multiFileMatch = line.match(/^([^:]+):(\d+):(.+)$/);
    if (multiFileMatch) {
      parsed.push({
        file: multiFileMatch[1],
        line: Number.parseInt(multiFileMatch[2], 10),
        content: multiFileMatch[3],
        isMatch: true,
      });
      continue;
    }

    // Try single-file format: line:content
    const singleFileMatch = line.match(/^(\d+):(.+)$/);
    if (singleFileMatch) {
      parsed.push({
        line: Number.parseInt(singleFileMatch[1], 10),
        content: singleFileMatch[2],
        isMatch: true,
      });
      continue;
    }

    // Try context line format: file-line-context
    const contextMatch = line.match(/^([^:]+)-(\d+)-(.+)$/);
    if (contextMatch) {
      parsed.push({
        file: contextMatch[1],
        line: Number.parseInt(contextMatch[2], 10),
        content: contextMatch[3],
        isMatch: false,
        isContext: true,
      });
      continue;
    }

    // Try context line format without file: line-context
    const contextNoFileMatch = line.match(/^(\d+)-(.+)$/);
    if (contextNoFileMatch) {
      parsed.push({
        line: Number.parseInt(contextNoFileMatch[1], 10),
        content: contextNoFileMatch[2],
        isMatch: false,
        isContext: true,
      });
      continue;
    }

    // If we get here, it's an unrecognized format - treat as match for backwards compatibility
    parsed.push({
      content: line,
      line: 0,
      isMatch: true,
    });
  }

  return parsed;
}

/**
 * Count actual matches (excluding context lines)
 */
export function countActualMatches(parsed: ParsedMatch[]): number {
  return parsed.filter((match) => match.isMatch && !match.isContext).length;
}

/**
 * Count context lines
 */
export function countContextLines(parsed: ParsedMatch[]): number {
  return parsed.filter((match) => match.isContext).length;
}

/**
 * Truncate matches to a maximum number of results
 */
export function truncateMatches(
  matches: ParsedMatch[],
  maxResults: number | null | undefined,
): { truncated: ParsedMatch[]; isTruncated: boolean } {
  if (!maxResults || maxResults <= 0) {
    return { truncated: matches, isTruncated: false };
  }

  const actualMatches = matches.filter((m) => m.isMatch && !m.isContext);

  if (actualMatches.length <= maxResults) {
    return { truncated: matches, isTruncated: false };
  }

  const truncated: ParsedMatch[] = [];
  let matchesKept = 0;

  for (const match of matches) {
    if (match.isMatch && !match.isContext) {
      if (matchesKept < maxResults) {
        truncated.push(match);
        matchesKept++;
      } else {
        break;
      }
    }
  }

  return {
    truncated,
    isTruncated: true,
  };
}

/**
 * Extract matches from content (backwards compatibility wrapper)
 */
export function extractMatches(content: string): string[] {
  const parsed = parseRipgrepOutput(content);
  const matches = parsed.filter((match) => match.isMatch && !match.isContext);

  // Convert back to original string format for backwards compatibility
  return matches.map((match) => {
    if (match.file) {
      return `${match.file}:${match.line}:${match.content}`;
    }
    return `${match.line}:${match.content}`;
  });
}

export function grepFiles(
  pattern: string,
  path: string,
  options: GrepOptions = {},
): string {
  const result = grepFilesStructured(pattern, path, options);
  return result.rawOutput;
}

export function grepFilesStructured(
  pattern: string,
  path: string,
  options: GrepOptions = {},
): GrepResult {
  try {
    const command = buildGrepCommand(pattern, path, options);
    const rawOutput = execSync(command, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const parsedMatches = parseRipgrepOutput(rawOutput);
    const matchCount = countActualMatches(parsedMatches);

    const { truncated, isTruncated } = truncateMatches(
      parsedMatches,
      options.maxResults,
    );
    const displayedCount = countActualMatches(truncated);
    const displayedContextCount = countContextLines(truncated);

    return {
      rawOutput,
      parsedMatches: truncated,
      matchCount,
      displayedCount,
      contextCount: displayedContextCount,
      hasMatches: matchCount > 0,
      isTruncated,
    };
  } catch (error) {
    const execError = error as ExecSyncError;
    const exitCode = execError?.status;

    if (exitCode === 1) {
      return {
        rawOutput: "No matches found.",
        parsedMatches: [],
        matchCount: 0,
        contextCount: 0,
        hasMatches: false,
      };
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
