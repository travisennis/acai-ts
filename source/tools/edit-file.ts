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

async function applyEditsSequentially(
  edits: FileEdit[],
  content: string,
  abortSignal?: AbortSignal,
  filePath?: string,
): Promise<string> {
  let modifiedContent = content;

  for (const edit of edits) {
    if (abortSignal?.aborted) {
      throw new Error("File edit operation aborted during processing");
    }

    const result = await applyNormalizedEdit(edit, modifiedContent);

    if (result.success) {
      modifiedContent = result.content;
    } else if (result.errorMessage) {
      throw new Error(result.errorMessage);
    } else {
      throw new Error(
        `Could not find the exact text in ${filePath}. The oldText must match exactly including all whitespace and newlines. ` +
          "Tip: Check for invisible characters, extra/missing whitespace, or line ending differences.",
      );
    }
  }

  return modifiedContent;
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

  const modifiedContent = await applyEditsSequentially(
    edits,
    content,
    abortSignal,
    filePath,
  );

  const finalContentWithLineEndings = restoreLineEndings(
    modifiedContent,
    originalLineEnding,
  );
  const finalContent = originalBom + finalContentWithLineEndings;

  const diff = createUnifiedDiff(content, finalContent, filePath);
  const formattedDiff = formatDiff(diff, filePath);

  if (!dryRun) {
    if (abortSignal?.aborted) {
      throw new Error("File edit operation aborted before writing");
    }
    await writeFile(filePath, finalContent, {
      encoding: "utf-8",
      signal: abortSignal,
    });
  }

  return formattedDiff;
}

interface ApplyEditResult {
  success: boolean;
  content: string;
  matchCount?: number;
  errorMessage?: string;
}

/**
 * Applies a single edit with normalized line endings
 * Returns an error if oldText matches more than one location in the file
 */
async function applyNormalizedEdit(
  edit: FileEdit,
  content: string,
): Promise<ApplyEditResult> {
  // Normalize line endings to match the normalized content
  const normalizedOldText = normalizeLineEndings(edit.oldText);
  const normalizedNewText = normalizeLineEndings(edit.newText);

  // First, check how many matches exist (without replacing)
  const matchCountResult = countMatches(content, normalizedOldText);
  const matchCount = matchCountResult.count;

  // If more than one match, require unique oldText
  if (matchCount > 1) {
    return {
      success: false,
      content,
      matchCount,
      errorMessage:
        `oldText matches ${matchCount} locations in the file but should match only 1. ` +
        "Please provide a more specific oldText that includes more surrounding context (e.g., 3+ lines, " +
        "function/class names, or unique surrounding code) to uniquely identify the location you want to edit.",
    };
  }

  // If no matches, return failure
  if (matchCount === 0) {
    return { success: false, content };
  }

  // Exactly one match - apply the edit
  const originalResult = applyLiteralEdit(
    content,
    normalizedOldText,
    normalizedNewText,
  );

  return { success: true, content: originalResult.content };
}

/**
 * Count the number of literal matches in content without replacing
 */
function countMatches(content: string, search: string): { count: number } {
  if (search === "") {
    return { count: 0 };
  }

  // Escape special regex characters for literal matching
  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escapedSearch, "g");

  // Count matches without modifying content
  const matches = content.match(regex);
  return { count: matches ? matches.length : 0 };
}

interface LiteralEditResult {
  matchCount: number;
  content: string;
}

/**
 * Applies a literal search and replace operation
 */
function applyLiteralEdit(
  content: string,
  search: string,
  replace: string,
): LiteralEditResult {
  if (search === "") {
    return { matchCount: 0, content };
  }

  // Escape special regex characters for literal matching
  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escapedSearch, "g");

  // Use replace with callback to count matches while replacing all occurrences
  let matchCount = 0;
  const modifiedContent = content.replace(regex, () => {
    matchCount++;
    return replace;
  });

  return { matchCount, content: modifiedContent };
}
