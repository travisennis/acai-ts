import {
  type ExecFileOptionsWithStringEncoding,
  execFile,
} from "node:child_process";
import { inspect } from "node:util";
import { z } from "zod";
import style from "../terminal/style.ts";

import { toDisplayPath } from "../utils/filesystem/path-display.ts";
import { convertNullString } from "../utils/zod.ts";
import type { ToolExecutionOptions } from "./types.ts";

// default limit
const DEFAULT_MAX_RESULTS = 100;

export const GrepTool = {
  name: "Grep" as const,
};

const inputSchema = z.object({
  pattern: z
    .string()
    .describe(
      "The search pattern (regex by default, or fixed-string if literal=true or auto-detected as unbalanced)",
    ),
  path: z.string().describe("The path to search in"),
  recursive: z
    .preprocess((val) => convertNullString(val), z.coerce.boolean().nullable())
    .describe("Search recursively. (default: true))"),
  ignoreCase: z
    .preprocess((val) => convertNullString(val), z.coerce.boolean().nullable())
    .describe("Use case-sensitive search. (default: false)"),
  filePattern: z
    .preprocess((val) => convertNullString(val), z.coerce.string().nullable())
    .describe(
      "Glob pattern to filter files (e.g., '*.ts', '**/*.test.js'). (Default: no filtering)",
    ),
  contextLines: z
    .preprocess((val) => convertNullString(val), z.coerce.number().nullable())
    .describe(
      "The number of context lines needed in search results. (Default: 0)",
    ),
  searchIgnored: z
    .preprocess((val) => convertNullString(val), z.coerce.boolean().nullable())
    .describe("Search ignored files. (Default: false)"),
  literal: z
    .preprocess((val) => convertNullString(val), z.coerce.boolean().nullable())
    .describe(
      "Pass true for fixed-string search (-F), false for regex, (Default: auto-detects unbalanced patterns like mismatched parentheses/brackets.)",
    ),
  maxResults: z
    .preprocess((val) => convertNullString(val), z.coerce.number().nullable())
    .describe(
      "Maximum number of matches to return. Set to 0 for no limit. (Default: 100)",
    ),
});

type GrepInputSchema = z.infer<typeof inputSchema>;

export const createGrepTool = () => {
  return {
    toolDef: {
      description: "Search file contents using ripgrep.",
      inputSchema,
    },
    display({
      pattern,
      path,
      filePattern,
      recursive,
      ignoreCase,
      contextLines,
    }: GrepInputSchema) {
      // grok doesn't follow my instructions
      const safeFilePattern =
        filePattern === "null" || filePattern === "undefined"
          ? null
          : filePattern;

      // Enhanced tool-init with detailed search parameters
      const displayPath = toDisplayPath(path);
      let initMessage = `${style.cyan(inspect(pattern))} in ${style.cyan(displayPath)}`;
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

      return initMessage;
    },
    async execute(
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
      { abortSignal }: ToolExecutionOptions,
    ): Promise<string> {
      if (abortSignal?.aborted) {
        throw new Error("Grep search aborted");
      }

      // Validate path - default to cwd if not provided
      const effectivePath =
        typeof path === "string" && path.trim() !== "" ? path : process.cwd();

      try {
        // Compute likelyUnbalancedRegex once and pass through
        const isLikelyUnbalanced = likelyUnbalancedRegex(pattern);

        let effectiveLiteral: boolean | null = null;
        if (literal === true) {
          effectiveLiteral = true;
        } else if (literal === false) {
          effectiveLiteral = false;
        } else {
          effectiveLiteral = isLikelyUnbalanced;
        }

        const effectiveMaxResults = maxResults ?? DEFAULT_MAX_RESULTS;

        const safeFilePattern =
          filePattern === "null" || filePattern === "undefined"
            ? null
            : filePattern;

        const grepResult = await grepFilesStructured(
          pattern,
          effectivePath,
          {
            recursive,
            ignoreCase,
            filePattern: safeFilePattern,
            contextLines,
            searchIgnored,
            literal: effectiveLiteral,
            maxResults: effectiveMaxResults,
            likelyUnbalanced: isLikelyUnbalanced,
          },
          abortSignal,
        );

        return grepResult.rawOutput;
      } catch (error) {
        const errorMessage = (error as Error).message;
        let userFriendlyError = `Error searching for "${pattern}" in ${effectivePath}: ${errorMessage}`;

        if (errorMessage.includes("No such file or directory")) {
          userFriendlyError = `Path not found: "${effectivePath}"`;
          if (filePattern) {
            userFriendlyError += ` with file pattern "${filePattern}"`;
          }
          userFriendlyError += " - check if the path exists and is accessible";
        } else if (errorMessage.includes("permission denied")) {
          userFriendlyError = `Permission denied accessing "${effectivePath}"`;
        } else if (errorMessage.includes("Regex parse error")) {
          userFriendlyError = `Invalid search pattern "${pattern}" - try using literal=true for fixed-string search`;
        }

        throw new Error(userFriendlyError);
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
  likelyUnbalanced?: boolean;
}

interface ExecFileError extends Error {
  code?: string | null;
  signal?: string | null;
}

/**
 * Check for invalid repetition operators (e.g., {n}, {n,}, {n,m}) outside of character classes.
 * Returns true if any invalid repetition operators are found.
 */
function hasInvalidRepetition(pattern: string): boolean {
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];

    if (ch === "\\") {
      i++; // Skip the next character (escaped)
      continue;
    }

    if (ch === "[") {
      // Skip character class
      i++;
      while (i < pattern.length && pattern[i] !== "]") {
        if (pattern[i] === "\\") i++;
        i++;
      }
      continue;
    }

    if (ch === "}") {
      // Unmatched closing brace is invalid
      return true;
    }

    if (ch === "{") {
      let j = i + 1;
      let hasDigits = false;
      let hasComma = false;

      // Parse content inside braces
      while (j < pattern.length && pattern[j] !== "}") {
        const c = pattern[j];
        if (c >= "0" && c <= "9") {
          hasDigits = true;
        } else if (c === "," && !hasComma) {
          hasComma = true;
        } else {
          // Invalid character inside braces
          return true;
        }
        j++;
      }

      // No closing brace found
      if (j >= pattern.length) {
        return true;
      }

      // Empty braces {} with no preceding atom are treated as literal
      if (!hasDigits) {
        const prev = i > 0 ? pattern[i - 1] : undefined;
        if (prev !== undefined && /\S/.test(prev)) {
          return true;
        }
      }

      i = j; // Move past the closing brace
    }
  }

  return false;
}

/**
 * Count bracket/paren/brace pairs in a regex pattern, excluding character classes.
 */
function countBrackets(pattern: string): {
  openParen: number;
  closeParen: number;
  openBracket: number;
  closeBracket: number;
  openBrace: number;
  closeBrace: number;
} {
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

  return counts;
}

export function likelyUnbalancedRegex(pattern: string): boolean {
  const counts = countBrackets(pattern);

  // Check for unbalanced brackets, parentheses, and braces
  const hasUnbalancedBrackets = counts.openBracket !== counts.closeBracket;
  const hasUnbalancedParens = counts.openParen !== counts.closeParen;
  const hasUnbalancedBraces = counts.openBrace !== counts.closeBrace;

  // Also check for invalid repetition operators
  const hasInvalidRepetitionFlag = hasInvalidRepetition(pattern);

  return (
    hasUnbalancedBrackets ||
    hasUnbalancedParens ||
    hasUnbalancedBraces ||
    hasInvalidRepetitionFlag
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

  // Use the pre-computed likelyUnbalanced result if available
  let effectiveLiteral: boolean;
  if (options.literal === true) {
    effectiveLiteral = true;
  } else if (options.literal === false) {
    effectiveLiteral = false;
  } else if (options.likelyUnbalanced !== undefined) {
    effectiveLiteral = options.likelyUnbalanced;
  } else {
    effectiveLiteral = likelyUnbalancedRegex(pattern);
  }

  let command = "rg --json";

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

  // Use ripgrep's --max-count flag to limit matches per file for efficiency
  // This helps prevent any single file from dominating results
  if (
    options.maxResults !== null &&
    options.maxResults !== undefined &&
    options.maxResults > 0
  ) {
    // Use a reasonable per-file limit (max 100 per file) to balance efficiency and completeness
    const perFileLimit = Math.min(options.maxResults, 100);
    command += ` --max-count=${perFileLimit}`;
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
  lineNumber?: number;
  absolutePath?: string;
  submatches?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

interface GrepResult {
  rawOutput: string;
  parsedMatches: ParsedMatch[];
  matchCount: number;
  displayedCount?: number;
  contextCount: number;
  hasMatches: boolean;
  isTruncated?: boolean;
}

/**
 * Parse ripgrep JSON output and extract structured match information
 */
export function parseRipgrepJsonOutput(content: string): ParsedMatch[] {
  if (!content || content.trim() === "") {
    return [];
  }

  const parsed: ParsedMatch[] = [];
  const lines = content.trim().split("\n");

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    try {
      const rgResult = JSON.parse(line);

      // Handle different ripgrep message types
      if (rgResult.type === "match") {
        const data = rgResult.data;
        parsed.push({
          file: data.path?.text ?? data.path?.bytes?.toString(),
          line: data.line_number ?? 0,
          content: data.lines?.text ?? data.line ?? "",
          isMatch: true,
          lineNumber: data.line_number,
          absolutePath:
            data.absolute_path?.text ?? data.absolute_path?.bytes?.toString(),
          submatches: data.submatches?.map(
            (sm: { start: number; end: number; text: string }) => ({
              start: sm.start,
              end: sm.end,
              text: sm.text,
            }),
          ),
        });
      } else if (rgResult.type === "context") {
        const data = rgResult.data;
        parsed.push({
          file: data.path?.text ?? data.path?.bytes?.toString(),
          line: data.line_number ?? 0,
          content: data.lines?.text ?? data.line ?? "",
          isMatch: false,
          isContext: true,
          lineNumber: data.line_number,
          absolutePath:
            data.absolute_path?.text ?? data.absolute_path?.bytes?.toString(),
        });
      }
      // Ignore other message types like "begin", "end", "summary"
    } catch {}
  }

  return parsed;
}

/**
 * Convert parsed JSON matches back to legacy line-number format for backwards compatibility
 */
function matchesToLegacyFormat(matches: ParsedMatch[]): string {
  const lines: string[] = [];

  for (const match of matches) {
    const lineNum = match.lineNumber ?? match.line;
    const file = match.file ?? match.absolutePath;

    if (file) {
      if (match.isMatch) {
        lines.push(`${file}:${lineNum}:${match.content}`);
      } else if (match.isContext) {
        lines.push(`${file}-${lineNum}-${match.content}`);
      }
    } else {
      if (match.isMatch) {
        lines.push(`${lineNum}:${match.content}`);
      } else if (match.isContext) {
        lines.push(`${lineNum}-${match.content}`);
      }
    }
  }

  return lines.join("\n");
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
 * Truncate matches to a maximum number of results, preserving context lines for kept matches
 */
export function truncateMatches(
  matches: ParsedMatch[],
  maxResults: number | null | undefined,
): { truncated: ParsedMatch[]; isTruncated: boolean } {
  if (!maxResults || maxResults <= 0) {
    return { truncated: matches, isTruncated: false };
  }

  // Find indices of actual matches (excluding context lines)
  const matchIndices: number[] = [];
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].isMatch && !matches[i].isContext) {
      matchIndices.push(i);
    }
  }

  if (matchIndices.length <= maxResults) {
    return { truncated: matches, isTruncated: false };
  }

  // Get the indices of matches we want to keep
  const indicesToKeep = new Set<number>();
  for (let i = 0; i < maxResults; i++) {
    indicesToKeep.add(matchIndices[i]);
  }

  // Build truncated result: include all kept matches AND their associated context lines
  const truncated: ParsedMatch[] = [];
  let matchesKept = 0;
  const contextWindow = 3; // Include up to 3 context lines around each match

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];

    if (match.isMatch && !match.isContext) {
      // This is an actual match
      if (matchesKept < maxResults) {
        truncated.push(match);
        matchesKept++;
      } else {
        break;
      }
    } else if (match.isContext) {
      // Check if this context line is adjacent to a kept match
      let hasKeptMatchNearby = false;
      for (let j = i - 1; j >= Math.max(0, i - contextWindow); j--) {
        if (
          matches[j].isMatch &&
          !matches[j].isContext &&
          indicesToKeep.has(j)
        ) {
          hasKeptMatchNearby = true;
          break;
        }
      }
      // Also look forward
      if (!hasKeptMatchNearby) {
        for (
          let j = i + 1;
          j < Math.min(matches.length, i + contextWindow + 1);
          j++
        ) {
          if (
            matches[j].isMatch &&
            !matches[j].isContext &&
            indicesToKeep.has(j)
          ) {
            hasKeptMatchNearby = true;
            break;
          }
        }
      }

      // Include context lines near kept matches
      if (hasKeptMatchNearby) {
        truncated.push(match);
      }
    } else {
      // Other types, include them
      truncated.push(match);
    }
  }

  return {
    truncated,
    isTruncated: true,
  };
}

export async function grepFilesStructured(
  pattern: string,
  path: string,
  options: GrepOptions = {},
  abortSignal?: AbortSignal | null,
): Promise<GrepResult> {
  try {
    const command = buildGrepCommand(pattern, path, options);

    // Use execFile for async execution with proper abort signal handling
    const rawOutput = await new Promise<string>((resolve, reject) => {
      // Parse command into file and args properly
      const cmdParts = command.slice(3); // Remove "rg " prefix
      const args: string[] = [];
      let current = "";
      let inQuote = false;
      let quoteChar = "";

      for (let i = 0; i < cmdParts.length; i++) {
        const char = cmdParts[i];
        if ((char === '"' || char === "'") && !inQuote) {
          inQuote = true;
          quoteChar = char;
        } else if (char === quoteChar && inQuote) {
          inQuote = false;
          quoteChar = "";
        } else if (char === " " && !inQuote) {
          if (current) {
            args.push(current);
            current = "";
          }
        } else {
          current += char;
        }
      }
      if (current) {
        args.push(current);
      }

      const child = execFile("rg", args, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      } as ExecFileOptionsWithStringEncoding);

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data;
      });

      child.stderr?.on("data", (data) => {
        stderr += data;
      });

      child.on("close", (code) => {
        if (code === 0 || code === 1) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `ripgrep exited with code ${code}`));
        }
      });

      child.on("error", (err) => {
        reject(err);
      });

      if (abortSignal) {
        abortSignal.addEventListener("abort", () => {
          child.kill("SIGTERM");
          reject(new Error("Grep search aborted"));
        });
      }
    });

    // Parse JSON output from ripgrep
    const parsedMatches = parseRipgrepJsonOutput(rawOutput);

    // If JSON parsing resulted in no matches, check if it's a "no matches" case
    // (ripgrep --json returns empty for no matches)
    const hasMatches = parsedMatches.length > 0;
    const matchCount = countActualMatches(parsedMatches);

    // Use the maxResults from options (which will be set by the execute function)
    const maxResults = options.maxResults;

    const { truncated, isTruncated } = truncateMatches(
      parsedMatches,
      maxResults,
    );
    const displayedCount = countActualMatches(truncated);
    const displayedContextCount = countContextLines(truncated);

    // Convert to legacy format for backwards compatibility
    const legacyOutput = matchesToLegacyFormat(truncated);
    const finalOutput = legacyOutput || "No matches found.";

    return {
      rawOutput: finalOutput,
      parsedMatches: truncated,
      matchCount,
      displayedCount,
      contextCount: displayedContextCount,
      hasMatches,
      isTruncated,
    };
  } catch (error) {
    const execError = error as ExecFileError;
    const exitCode = execError.code;

    if (exitCode === "1") {
      return {
        rawOutput: "No matches found.",
        parsedMatches: [],
        matchCount: 0,
        contextCount: 0,
        hasMatches: false,
      };
    }

    if (exitCode === "2") {
      const stderrStr = execError.message;
      throw new Error(
        `Regex parse error in pattern "${pattern}": ${stderrStr}`,
      );
    }

    throw new Error(`Error executing ripgrep: ${execError.message}`);
  }
}
