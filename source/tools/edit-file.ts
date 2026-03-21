import { access, constants, readFile, writeFile } from "node:fs/promises";
import { createTwoFilesPatch } from "diff";
import { z } from "zod";
import { config } from "../config/index.ts";
import type { WorkspaceContext } from "../index.ts";
import { clearProjectStatusCache } from "../repl/project-status.ts";
import style from "../terminal/style.ts";
import { toDisplayPath } from "../utils/filesystem/path-display.ts";
import {
  joinWorkingDir,
  validateFileNotReadOnly,
  validatePath,
} from "../utils/filesystem/security.ts";
import type { ToolExecutionOptions } from "./types.ts";

export const EditFileTool = {
  name: "Edit" as const,
};

const MAX_EDITS_PER_CALL = 10;

const inputSchema = z.object({
  path: z.string().describe("The path of the file to edit."),
  edits: z
    .preprocess(
      (val) => {
        // Handle case where model passes a JSON string instead of an array
        if (typeof val === "string") {
          const trimmed = val.trim();
          // Try parsing as JSON if it looks like an array
          if (trimmed.startsWith("[")) {
            try {
              const parsed: unknown = JSON.parse(trimmed);
              if (Array.isArray(parsed)) {
                return parsed;
              }
            } catch {
              // Not valid JSON, treat as a plain string
            }
          }
        }
        return val;
      },
      z.array(
        z.object({
          oldText: z
            .string()
            .describe(
              "Text to search for - must match exactly. The oldText must uniquely identify the location - include enough surrounding context (e.g., 3+ lines or function/class names) to ensure only ONE match exists in the file. " +
                "Special characters require JSON escaping: backticks (`\\``...\\``), quotes, backslashes. " +
                "For multi-line content, include exact newlines and indentation.",
            )
            .min(1, "oldText must be at least 1 character"),
          newText: z.string().describe("Text to replace with"),
        }),
      ),
    )
    .describe("The edits to make to the file."),
});

type EditFileInputSchema = z.infer<typeof inputSchema>;

export const createEditFileTool = async (options: {
  workspace: WorkspaceContext;
}) => {
  const { primaryDir, allowedDirs } = options.workspace;
  const allowedDirectory = allowedDirs ?? [primaryDir];

  // Cache config at tool creation time instead of on every execute
  const projectConfig = await config.getConfig();

  return {
    toolDef: {
      description: "Edit text in files using literal search-and-replace.",
      inputSchema,
    },
    display({ path, edits }: EditFileInputSchema) {
      const displayPath = toDisplayPath(path);
      return `${style.cyan(displayPath)} (${edits.length} edit${edits.length === 1 ? "" : "s"})`;
    },
    async execute(
      { path, edits }: EditFileInputSchema,
      { abortSignal }: ToolExecutionOptions,
    ): Promise<string> {
      if (abortSignal?.aborted) {
        throw new Error("File editing aborted");
      }

      // Check for excessive edits and return helpful message to the model
      if (edits.length > MAX_EDITS_PER_CALL) {
        throw new Error(
          `Too many edits (${edits.length}). Maximum ${MAX_EDITS_PER_CALL} edits per call. ` +
            "Please split your changes into multiple tool calls. " +
            "For example, if you need to make 20 edits, make 2 calls with 10 edits each.",
        );
      }

      const validPath = await validatePath(
        joinWorkingDir(path, primaryDir),
        allowedDirectory,
        { abortSignal },
      );

      validateFileNotReadOnly(validPath, projectConfig, primaryDir);

      const result = await applyFileEdits(validPath, edits, false, abortSignal);

      clearProjectStatusCache();

      return result;
    },
  };
};

// file editing and diffing utilities

/** Detect the line ending used in the content */
function detectLineEnding(content: string): "\r\n" | "\n" {
  const crlfIdx = content.indexOf("\r\n");
  const lfIdx = content.indexOf("\n");
  // If no line endings at all, default to LF
  if (crlfIdx === -1 && lfIdx === -1) return "\n";
  // If CRLF exists (and either no LF or CRLF comes first), return CRLF
  if (crlfIdx !== -1 && (lfIdx === -1 || crlfIdx < lfIdx)) {
    return "\r\n";
  }
  return "\n";
}

/** Normalize line endings to LF for internal processing */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Restore original line endings after processing */
function restoreLineEndings(text: string, ending: "\r\n" | "\n"): string {
  return ending === "\r\n" ? text.replace(/\n/g, "\r\n") : text;
}

/** Strip UTF-8 BOM if present - users won't include invisible BOM in oldText */
function stripBom(content: string): { bom: string; text: string } {
  return content.startsWith("\uFEFF")
    ? { bom: "\uFEFF", text: content.slice(1) }
    : { bom: "", text: content };
}

function createUnifiedDiff(
  normalizedOriginal: string,
  normalizedNew: string,
  filepath = "file",
): string {
  return createTwoFilesPatch(
    filepath,
    filepath,
    normalizedOriginal,
    normalizedNew,
    "original",
    "modified",
  );
}

interface FileEdit {
  oldText: string;
  newText: string;
}

async function validateFileReadable(filePath: string): Promise<void> {
  try {
    await access(filePath, constants.R_OK);
  } catch {
    throw new Error(`File not found or not readable: ${filePath}`);
  }
}

function validateEdits(edits: FileEdit[]): void {
  if (edits.some((edit) => edit.oldText.length === 0)) {
    throw new Error(
      "Invalid oldText in edit. The value of oldText must be at least one character",
    );
  }
}

/**
 * Normalize text for fuzzy matching by:
 * - Unicode NFKC normalization (canonical compatibility decomposition)
 * - Converting smart quotes to straight quotes
 * - Unifying various dash characters to hyphen
 * - Normalizing whitespace characters to regular space
 * - Removing trailing whitespace from each line
 */
function normalizeForFuzzyMatch(text: string): string {
  return text
    .normalize("NFKC")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // curly single quotes → '
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // curly double quotes → "
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-") // dashes → -
    .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " "); // spaces → space
}

interface FuzzyMatchResult {
  found: boolean;
  index: number;
  matchLength: number;
  usedFuzzyMatch: boolean;
}

/**
 * Find text in content, trying exact match first, then fuzzy match.
 * When fuzzy match is used, positions are in the normalized content.
 * IMPORTANT: When fuzzy matching is needed, the caller must work entirely
 * in normalized space to avoid position mapping issues.
 */
function fuzzyFindText(content: string, searchText: string): FuzzyMatchResult {
  // Try exact match first
  const exactIndex = content.indexOf(searchText);
  if (exactIndex !== -1) {
    return {
      found: true,
      index: exactIndex,
      matchLength: searchText.length,
      usedFuzzyMatch: false,
    };
  }

  // Fall back to fuzzy matching
  const fuzzyContent = normalizeForFuzzyMatch(content);
  const fuzzySearch = normalizeForFuzzyMatch(searchText);
  const fuzzyIndex = fuzzyContent.indexOf(fuzzySearch);

  if (fuzzyIndex === -1) {
    return { found: false, index: -1, matchLength: 0, usedFuzzyMatch: false };
  }

  return {
    found: true,
    index: fuzzyIndex,
    matchLength: fuzzySearch.length,
    usedFuzzyMatch: true,
  };
}

/**
 * Count how many times searchText appears in content (exact or fuzzy).
 * Used to ensure uniqueness.
 */
function countMatches(content: string, searchText: string): number {
  // Count exact matches first
  const exactEscaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exactRegex = new RegExp(exactEscaped, "g");
  const exactMatches = content.match(exactRegex);
  const exactCount = exactMatches ? exactMatches.length : 0;

  if (exactCount > 0) {
    return exactCount;
  }

  // Count fuzzy matches
  const fuzzyContent = normalizeForFuzzyMatch(content);
  const fuzzySearch = normalizeForFuzzyMatch(searchText);
  const fuzzyEscaped = fuzzySearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fuzzyRegex = new RegExp(fuzzyEscaped, "g");
  const fuzzyMatches = fuzzyContent.match(fuzzyRegex);
  return fuzzyMatches ? fuzzyMatches.length : 0;
}

interface MatchedEdit extends FileEdit {
  index: number; // Position in content (normalized if fuzzy matching)
  matchLength: number; // Length of matched text
  editIndex: number; // Original index in edits array
}

interface PreflightResult {
  success: boolean;
  matchedEdits: MatchedEdit[];
  errorMessage?: string;
  usedFuzzyMatch: boolean;
  baseContent: string; // Content to apply edits to (normalized if fuzzy)
}

/**
 * Preflight validation: Find all edit positions, validate uniqueness and no overlaps.
 * If any edit requires fuzzy matching, normalize the entire content and work in
 * normalized space. This avoids position mapping issues.
 */
function preflightEdits(edits: FileEdit[], content: string): PreflightResult {
  const normalizedEdits = edits.map((edit) => ({
    oldText: normalizeLineEndings(edit.oldText),
    newText: normalizeLineEndings(edit.newText),
  }));

  // Check if any edit requires fuzzy matching
  const needsFuzzyMatching = normalizedEdits.some(
    (edit) => content.indexOf(edit.oldText) === -1,
  );

  // Use normalized content if fuzzy matching is needed
  const baseContent = needsFuzzyMatching
    ? normalizeForFuzzyMatch(content)
    : content;

  const matchedEdits: MatchedEdit[] = [];

  // First pass: Find all match positions
  for (let i = 0; i < normalizedEdits.length; i++) {
    const edit = normalizedEdits[i];

    // Check uniqueness
    const matchCount = countMatches(baseContent, edit.oldText);

    if (matchCount === 0) {
      return {
        success: false,
        matchedEdits: [],
        errorMessage:
          `Edit ${i + 1}: Could not find the exact text. ` +
          "The oldText must match exactly including all whitespace and newlines.",
        usedFuzzyMatch: needsFuzzyMatching,
        baseContent,
      };
    }

    if (matchCount > 1) {
      const fuzzyContext = needsFuzzyMatching
        ? " (including fuzzy matches)"
        : "";
      return {
        success: false,
        matchedEdits: [],
        errorMessage:
          `Edit ${i + 1}: oldText matches ${matchCount} locations${fuzzyContext} but should match only 1. ` +
          "Please provide a more specific oldText that includes more surrounding context.",
        usedFuzzyMatch: needsFuzzyMatching,
        baseContent,
      };
    }

    // Find the match position
    const matchResult = fuzzyFindText(baseContent, edit.oldText);

    if (!matchResult.found) {
      return {
        success: false,
        matchedEdits: [],
        errorMessage: `Edit ${i + 1}: Could not find the text (unexpected error).`,
        usedFuzzyMatch: needsFuzzyMatching,
        baseContent,
      };
    }

    matchedEdits.push({
      ...edit,
      index: matchResult.index,
      matchLength: matchResult.matchLength,
      editIndex: i,
    });
  }

  // Sort by position (ascending) for overlap detection
  matchedEdits.sort((a, b) => a.index - b.index);

  // Check for overlapping edits
  for (let i = 0; i < matchedEdits.length - 1; i++) {
    const current = matchedEdits[i];
    const next = matchedEdits[i + 1];

    // Check if current edit overlaps with next edit
    if (current.index + current.matchLength > next.index) {
      return {
        success: false,
        matchedEdits: [],
        errorMessage:
          `Edits ${current.editIndex + 1} and ${next.editIndex + 1} overlap in the file. ` +
          "Each edit must target a distinct region. Please combine overlapping edits into a single edit.",
        usedFuzzyMatch: needsFuzzyMatching,
        baseContent,
      };
    }
  }

  return {
    success: true,
    matchedEdits,
    usedFuzzyMatch: needsFuzzyMatching,
    baseContent,
  };
}

/**
 * Apply edits in reverse position order (highest index first).
 * This prevents position shifting - earlier edits don't affect later ones.
 * All positions are relative to baseContent (normalized if fuzzy matching).
 */
function applyEditsReverseOrder(
  content: string,
  matchedEdits: MatchedEdit[],
): string {
  let result = content;

  // Process in reverse order (highest index first)
  for (let i = matchedEdits.length - 1; i >= 0; i--) {
    const edit = matchedEdits[i];
    const before = result.slice(0, edit.index);
    const after = result.slice(edit.index + edit.matchLength);
    result = before + edit.newText + after;
  }

  return result;
}

function formatDiff(diff: string, _filePath: string): string {
  let numBackticks = 3;
  while (diff.includes("`".repeat(numBackticks))) {
    numBackticks++;
  }
  return `${"`".repeat(numBackticks)} diff\n${diff}\n${"`".repeat(numBackticks)}`;
}

export async function applyFileEdits(
  filePath: string,
  edits: FileEdit[],
  dryRun = false,
  abortSignal?: AbortSignal,
): Promise<string> {
  if (abortSignal?.aborted) {
    throw new Error("File edit operation aborted");
  }

  await validateFileReadable(filePath);

  const rawContent = await readFile(filePath, {
    encoding: "utf-8",
    signal: abortSignal,
  });

  const { bom: originalBom, text: bomStrippedContent } = stripBom(rawContent);
  const originalLineEnding = detectLineEnding(bomStrippedContent);
  const content = normalizeLineEndings(bomStrippedContent);

  validateEdits(edits);

  // PREFLIGHT: Find all positions, validate no overlaps
  const preflight = preflightEdits(edits, content);

  if (!preflight.success) {
    throw new Error(`Edit validation failed: ${preflight.errorMessage}`);
  }

  // All edits validated - apply in reverse order
  // Note: baseContent is normalized if fuzzy matching was needed
  const modifiedContent = applyEditsReverseOrder(
    preflight.baseContent,
    preflight.matchedEdits,
  );

  // Verify something actually changed
  if (modifiedContent === preflight.baseContent) {
    throw new Error(
      "No changes were made - all edits resulted in identical content",
    );
  }

  const finalContentWithLineEndings = restoreLineEndings(
    modifiedContent,
    originalLineEnding,
  );
  const finalContent = originalBom + finalContentWithLineEndings;

  // Use baseContent for diff (normalized if fuzzy matching)
  const diff = createUnifiedDiff(
    preflight.baseContent,
    modifiedContent,
    filePath,
  );
  const formattedDiff = formatDiff(diff, filePath);

  // Add fuzzy match indicator if applicable
  const result = preflight.usedFuzzyMatch
    ? `${formattedDiff}\n\n(Note: Used fuzzy matching - file content has been normalized)`
    : formattedDiff;

  if (!dryRun) {
    if (abortSignal?.aborted) {
      throw new Error("File edit operation aborted before writing");
    }
    await writeFile(filePath, finalContent, {
      encoding: "utf-8",
      signal: abortSignal,
    });
  }

  return result;
}
