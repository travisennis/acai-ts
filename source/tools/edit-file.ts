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

const inputSchema = z.object({
  path: z.string().describe("The path of the file to edit."),
  edits: z
    .preprocess(
      (val) => {
        if (typeof val === "string") {
          const trimmed = val.trim();
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
              "Text to search for - must match exactly and enough context must be provided to uniquely match the target text. " +
                "Special characters require JSON escaping: backticks (\\`...\\`), quotes, backslashes. " +
                "For multi-line content, include exact newlines and indentation.",
            ),
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

export async function applyFileEdits(
  filePath: string,
  edits: FileEdit[],
  dryRun = false,
  abortSignal?: AbortSignal,
): Promise<string> {
  if (abortSignal?.aborted) {
    throw new Error("File edit operation aborted");
  }

  // Check if file exists and is readable
  try {
    await access(filePath, constants.R_OK);
  } catch {
    throw new Error(`File not found or not readable: ${filePath}`);
  }

  // Read file content
  const rawContent = await readFile(filePath, {
    encoding: "utf-8",
    signal: abortSignal,
  });

  // Strip BOM before processing (users won't include invisible BOM in oldText)
  const { bom: originalBom, text: bomStrippedContent } = stripBom(rawContent);

  // Detect and preserve original line endings
  const originalLineEnding = detectLineEnding(bomStrippedContent);
  const content = normalizeLineEndings(bomStrippedContent);

  if (edits.some((edit) => edit.oldText.length === 0)) {
    throw new Error(
      "Invalid oldText in edit. The value of oldText must be at least one character",
    );
  }

  // Apply edits sequentially using literal matches (allow multiple matches)
  let modifiedContent = content;
  for (const edit of edits) {
    if (abortSignal?.aborted) {
      throw new Error("File edit operation aborted during processing");
    }

    const result = await applyNormalizedEdit(edit, modifiedContent);

    if (result.success) {
      modifiedContent = result.content;
    } else {
      throw new Error(
        `Could not find the exact text in ${filePath}. The oldText must match exactly including all whitespace and newlines. ` +
          "Tip: Check for invisible characters, extra/missing whitespace, or line ending differences.",
      );
    }
  }

  // Restore original line endings and BOM
  const finalContentWithLineEndings = restoreLineEndings(
    modifiedContent,
    originalLineEnding,
  );
  const finalContent = originalBom + finalContentWithLineEndings;

  // Create unified diff (use normalized content for diff to avoid noisy line ending changes)
  const diff = createUnifiedDiff(content, finalContent, filePath);

  // Format diff with appropriate number of backticks
  let numBackticks = 3;
  while (diff.includes("`".repeat(numBackticks))) {
    numBackticks++;
  }
  const formattedDiff = `${"`".repeat(numBackticks)} diff\n${diff}\n${"`".repeat(numBackticks)}`;

  if (!dryRun) {
    if (abortSignal?.aborted) {
      throw new Error("File edit operation aborted before writing");
    }
    // Write the modified content with signal
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
}

/**
 * Applies a single edit with normalized line endings
 */
async function applyNormalizedEdit(
  edit: FileEdit,
  content: string,
): Promise<ApplyEditResult> {
  // Normalize line endings to match the normalized content
  const normalizedOldText = normalizeLineEndings(edit.oldText);
  const normalizedNewText = normalizeLineEndings(edit.newText);

  const originalResult = applyLiteralEdit(
    content,
    normalizedOldText,
    normalizedNewText,
  );
  if (originalResult.matchCount > 0) {
    return { success: true, content: originalResult.content };
  }

  return { success: false, content };
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
