import { execSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import type { ToolCallOptions } from "ai";
import { createTwoFilesPatch } from "diff";
import { z } from "zod";
import { config } from "../config.ts";
import style from "../terminal/style.ts";
import {
  joinWorkingDir,
  validateFileNotReadOnly,
  validatePath,
} from "../utils/filesystem/security.ts";
import type { ToolResult } from "./types.ts";

export const AdvancedEditFileTool = {
  name: "advancedEditFile" as const,
};

const inputSchema = z.object({
  path: z.string().describe("The path of the file to edit."),
  mode: z
    .enum(["exact", "regex", "ast"])
    .default("exact")
    .describe(
      "Editing mode: exact (literal text), regex (pattern matching), or ast (AST-aware)",
    ),
  operations: z.array(
    z.object({
      type: z
        .enum(["replace", "insert-before", "insert-after", "delete"])
        .describe("Type of operation to perform"),
      pattern: z
        .string()
        .describe(
          "Pattern to match (text, regex, or AST pattern depending on mode)",
        ),
      replacement: z
        .string()
        .optional()
        .describe("Replacement text (required for replace operations)"),
      flags: z
        .string()
        .optional()
        .describe("Regex flags for regex mode (e.g., 'g', 'i', 'm')"),
    }),
  ),
  astPattern: z
    .string()
    .optional()
    .describe("AST-grep search pattern for AST mode (e.g., 'var $V = $VAL')"),
  astReplacement: z
    .string()
    .optional()
    .describe(
      "AST-grep replacement pattern for AST mode (e.g., 'let $V = $VAL')",
    ),
  dryRun: z.boolean().default(false).describe("Show changes without writing"),
});

type AdvancedEditFileInputSchema = z.infer<typeof inputSchema>;

interface FileOperation {
  type: "replace" | "insert-before" | "insert-after" | "delete";
  pattern: string;
  replacement?: string;
  flags?: string;
}

export const createAdvancedEditFileTool = async ({
  workingDir,
  allowedDirs,
}: {
  workingDir: string;
  allowedDirs?: string[];
}) => {
  const allowedDirectory = allowedDirs ?? [workingDir];
  return {
    toolDef: {
      description:
        "Advanced file editing with multiple modes: exact text matching, regex pattern matching, and AST-aware editing. " +
        "Supports replace, insert-before, insert-after, and delete operations. AST mode requires ast-grep to be installed.",
      inputSchema,
    },
    async *execute(
      {
        path,
        mode,
        operations,
        astPattern,
        astReplacement,
        dryRun,
      }: AdvancedEditFileInputSchema,
      { toolCallId, abortSignal }: ToolCallOptions,
    ): AsyncGenerator<ToolResult> {
      try {
        if (abortSignal?.aborted) {
          throw new Error("File editing aborted");
        }

        yield {
          name: AdvancedEditFileTool.name,
          id: toolCallId,
          event: "tool-init",
          data: `${style.cyan(path)} (mode: ${mode})`,
        };

        const validPath = await validatePath(
          joinWorkingDir(path, workingDir),
          allowedDirectory,
          { abortSignal },
        );

        // Check if file is read-only
        const projectConfig = await config.getConfig();
        validateFileNotReadOnly(validPath, projectConfig, workingDir);

        const result = await applyAdvancedFileEdits(
          validPath,
          mode,
          operations,
          astPattern,
          astReplacement,
          dryRun,
          abortSignal,
        );

        yield {
          name: AdvancedEditFileTool.name,
          id: toolCallId,
          event: "tool-completion",
          data: `Applied ${operations.length} edits`,
        };

        yield result;
      } catch (error) {
        yield {
          name: AdvancedEditFileTool.name,
          event: "tool-error",
          id: toolCallId,
          data: (error as Error).message,
        };
        yield `Failed to edit file: ${(error as Error).message}`;
      }
    },
  };
};

// file editing and diffing utilities
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function createUnifiedDiff(
  originalContent: string,
  newContent: string,
  filepath = "file",
): string {
  // Ensure consistent line endings for diff
  const normalizedOriginal = normalizeLineEndings(originalContent);
  const normalizedNew = normalizeLineEndings(newContent);
  return createTwoFilesPatch(
    filepath,
    filepath,
    normalizedOriginal,
    normalizedNew,
    "original",
    "modified",
  );
}

function applyExactModeEdits(
  content: string,
  operations: FileOperation[],
): string {
  let modifiedContent = content;

  for (const op of operations) {
    switch (op.type) {
      case "replace": {
        if (!op.replacement) {
          throw new Error("Replacement text required for replace operation");
        }
        // Exact text replacement (global)
        let currentIndex = 0;
        let matchCount = 0;

        while (currentIndex < modifiedContent.length) {
          const matchIndex = modifiedContent.indexOf(op.pattern, currentIndex);
          if (matchIndex === -1) {
            break;
          }

          matchCount++;
          modifiedContent =
            modifiedContent.slice(0, matchIndex) +
            op.replacement +
            modifiedContent.slice(matchIndex + op.pattern.length);

          currentIndex = matchIndex + op.replacement.length;
        }

        if (matchCount === 0) {
          throw new Error(`Pattern not found in content: ${op.pattern}`);
        }
        break;
      }

      case "insert-before": {
        if (!op.replacement) {
          throw new Error(
            "Replacement text required for insert-before operation",
          );
        }
        const beforeIndex = modifiedContent.indexOf(op.pattern);
        if (beforeIndex === -1) {
          throw new Error(`Pattern not found for insert-before: ${op.pattern}`);
        }
        modifiedContent =
          modifiedContent.slice(0, beforeIndex) +
          op.replacement +
          "\n" +
          modifiedContent.slice(beforeIndex);
        break;
      }

      case "insert-after": {
        if (!op.replacement) {
          throw new Error(
            "Replacement text required for insert-after operation",
          );
        }
        const afterIndex = modifiedContent.indexOf(op.pattern);
        if (afterIndex === -1) {
          throw new Error(`Pattern not found for insert-after: ${op.pattern}`);
        }
        const insertPosition = afterIndex + op.pattern.length;
        modifiedContent =
          modifiedContent.slice(0, insertPosition) +
          "\n" +
          op.replacement +
          modifiedContent.slice(insertPosition);
        break;
      }

      case "delete": {
        // For delete operations, use line-based approach to handle newlines properly
        const lines = modifiedContent.split("\n");
        const filteredLines = lines.filter(
          (line) => !line.includes(op.pattern),
        );

        if (filteredLines.length === lines.length) {
          throw new Error(`Pattern not found for delete: ${op.pattern}`);
        }

        modifiedContent = filteredLines.join("\n");
        break;
      }
    }
  }

  return modifiedContent;
}

function applyRegexModeEdits(
  content: string,
  operations: FileOperation[],
): string {
  let modifiedContent = content;

  for (const op of operations) {
    const flags = op.flags || "g";
    const regex = new RegExp(op.pattern, flags);

    switch (op.type) {
      case "replace":
        if (!op.replacement) {
          throw new Error("Replacement text required for replace operation");
        }
        modifiedContent = modifiedContent.replace(regex, op.replacement);
        break;

      case "insert-before":
        if (!op.replacement) {
          throw new Error(
            "Replacement text required for insert-before operation",
          );
        }
        modifiedContent = modifiedContent.replace(
          regex,
          `${op.replacement}\n$&`,
        );
        break;

      case "insert-after":
        if (!op.replacement) {
          throw new Error(
            "Replacement text required for insert-after operation",
          );
        }
        modifiedContent = modifiedContent.replace(
          regex,
          `$&\n${op.replacement}`,
        );
        break;

      case "delete":
        modifiedContent = modifiedContent.replace(regex, "");
        break;
    }
  }

  return modifiedContent;
}

function applyAstModeEdits(
  filePath: string,
  astPattern: string,
  astReplacement: string,
  dryRun: boolean,
): string {
  if (!astPattern || !astReplacement) {
    throw new Error("AST mode requires both astPattern and astReplacement");
  }

  try {
    const cmd = [
      "ast-grep",
      "--pattern",
      `"${astPattern}"`,
      "--rewrite",
      `"${astReplacement}"`,
      dryRun ? "--dry-run" : "--write",
      filePath,
    ].join(" ");

    if (dryRun) {
      const output = execSync(cmd, { encoding: "utf-8" });
      return `AST edit preview:\n${output}`;
    }

    execSync(cmd, { stdio: "inherit" });
    return `AST edit applied to ${filePath}`;
  } catch (err) {
    throw new Error(`AST edit failed: ${(err as Error).message}`);
  }
}

export async function applyAdvancedFileEdits(
  filePath: string,
  mode: "exact" | "regex" | "ast",
  operations: FileOperation[],
  astPattern?: string,
  astReplacement?: string,
  dryRun = false,
  abortSignal?: AbortSignal,
): Promise<string> {
  if (abortSignal?.aborted) {
    throw new Error("File edit operation aborted");
  }

  // Read file content literally with signal
  const originalContent = await readFile(filePath, {
    encoding: "utf-8",
    signal: abortSignal,
  });

  let modifiedContent = originalContent;
  let resultMessage = "";

  if (mode === "ast") {
    // AST mode uses external ast-grep tool
    if (!astPattern || !astReplacement) {
      throw new Error("AST mode requires both astPattern and astReplacement");
    }
    resultMessage = applyAstModeEdits(
      filePath,
      astPattern,
      astReplacement,
      dryRun,
    );

    if (dryRun) {
      return resultMessage;
    }

    // For actual AST edits, read the modified content back
    modifiedContent = await readFile(filePath, {
      encoding: "utf-8",
      signal: abortSignal,
    });
  } else {
    // Text-based modes (exact and regex)
    if (operations.length === 0) {
      throw new Error("No operations specified for text-based editing mode");
    }

    switch (mode) {
      case "exact":
        modifiedContent = applyExactModeEdits(originalContent, operations);
        break;
      case "regex":
        modifiedContent = applyRegexModeEdits(originalContent, operations);
        break;
    }

    // Create unified diff
    const diff = createUnifiedDiff(originalContent, modifiedContent, filePath);

    // Format diff with appropriate number of backticks
    let numBackticks = 3;
    while (diff.includes("`".repeat(numBackticks))) {
      numBackticks++;
    }
    resultMessage = `${"`".repeat(numBackticks)}diff\n${diff}${"`".repeat(numBackticks)}\n\n`;

    if (!dryRun) {
      if (abortSignal?.aborted) {
        throw new Error("File edit operation aborted before writing");
      }
      // Write the modified content with signal
      await writeFile(filePath, modifiedContent, {
        encoding: "utf-8",
        signal: abortSignal,
      });
    }
  }

  return resultMessage;
}
