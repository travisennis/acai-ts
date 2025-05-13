import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { confirm, input } from "@inquirer/prompts";
import { isNumber } from "@travisennis/stdlib/typeguards";
import { tool } from "ai";
import chalk from "chalk";
import { createTwoFilesPatch } from "diff";
import ignore, { type Ignore } from "ignore";
import { z } from "zod";
import { config } from "../config.ts";
import type { Terminal } from "../terminal/index.ts";
import type { TokenCounter } from "../token-utils.ts";
import type { SendData } from "./types.ts";

// Normalize all paths consistently
function normalizePath(p: string): string {
  return path.normalize(p);
}

// Handle path joining with working directory
function joinWorkingDir(userPath: string, workingDir: string): string {
  if (path.isAbsolute(userPath)) {
    return path.normalize(userPath);
  }
  return path.normalize(path.join(workingDir, userPath));
}

function expandHome(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// Security utilities
async function validatePath(
  requestedPath: string,
  allowedDirectory: string,
): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);
  const normalizedRequested = normalizePath(absolute);

  // Check if path is within allowed directories
  const isAllowed = normalizedRequested.startsWith(allowedDirectory);
  if (!isAllowed) {
    throw new Error(
      `Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectory}`,
    );
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    const isRealPathAllowed = normalizedReal.startsWith(allowedDirectory);
    if (!isRealPathAllowed) {
      throw new Error(
        "Access denied - symlink target outside allowed directories",
      );
    }
    return realPath;
  } catch (_error) {
    // For new files that don't exist yet, verify parent directory
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await fs.realpath(parentDir);
      const normalizedParent = normalizePath(realParentPath);
      const isParentAllowed = normalizedParent.startsWith(allowedDirectory);
      if (!isParentAllowed) {
        throw new Error(
          "Access denied - parent directory outside allowed directories",
        );
      }
      return absolute;
    } catch {
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
  }
}

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

interface FileEdit {
  oldText: string;
  newText: string;
}

async function backupFile(filePath: string): Promise<void> {
  /**
   * Create a backup of a file before editing.
   */
  const backupPath = `${filePath}.backup`;
  try {
    const content = await fs.readFile(filePath, "utf8");
    await fs.writeFile(backupPath, content);
  } catch (error) {
    // If we can't create a backup, just log the error
    console.error(`Failed to create backup of ${filePath}: ${error}`);
  }
}

async function applyFileEdits(
  filePath: string,
  edits: FileEdit[],
  dryRun = false,
): Promise<string> {
  // Read file content literally
  const originalContent = await fs.readFile(filePath, "utf-8");

  if (edits.find((edit) => edit.oldText.length === 0)) {
    throw new Error(
      "Invalid oldText in edit. The value of oldText must be at least one character",
    );
  }

  // Apply edits sequentially
  let modifiedContent = originalContent;
  for (const edit of edits) {
    const { oldText, newText } = edit; // Use literal oldText and newText

    if (modifiedContent.includes(oldText)) {
      // Literal replacement of the first occurrence
      modifiedContent = modifiedContent.replace(oldText, newText);
    } else {
      // If literal match is not found, throw an error.
      // The previous complex fallback logic is removed to ensure literal matching.
      throw new Error(
        `Could not find literal match for edit:\n${edit.oldText}`,
      );
    }
  }

  // Create unified diff (createUnifiedDiff normalizes line endings internally for diffing)
  const diff = createUnifiedDiff(originalContent, modifiedContent, filePath);

  // Format diff with appropriate number of backticks
  let numBackticks = 3;
  while (diff.includes("`".repeat(numBackticks))) {
    numBackticks++;
  }
  const formattedDiff = `${"`".repeat(numBackticks)}diff\n${diff}${"`".repeat(numBackticks)}\n\n`;

  if (!dryRun) {
    // Create backup before writing changes
    await backupFile(filePath);
    // Write the modified content (which has literal newlines from newText, and preserves original newlines not part of oldText/newText)
    await fs.writeFile(filePath, modifiedContent, "utf-8");
  }

  return formattedDiff;
}

/**
 * Generates the indentation string for a given level in the directory tree.
 * @param level - The current level in the directory tree.
 * @param isLast - Indicates if the current item is the last in its parent directory.
 * @returns The indentation string for the current level.
 */
function getIndent(level: number, isLast: boolean): string {
  const indent = "│   ".repeat(level - 1);
  return level === 0 ? "" : `${indent}${isLast ? "└── " : "├── "}`;
}

/**
 * Recursively generates a string representation of a directory tree.
 * @param dirPath - The path of the directory to generate the tree for.
 * @param level - The current level in the directory tree (default: 1).
 * @returns A Promise that resolves to a string representation of the directory tree.
 * @throws Will log an error if there's an issue reading the directory.
 */
async function generateDirectoryTree(
  dirPath: string,
  ig: Ignore,
  level = 1,
): Promise<string> {
  try {
    const name = path.basename(dirPath);
    let output = `${getIndent(level, false)}${name}\n`;

    const items = await fs.readdir(dirPath);
    const filteredItems = ig.filter(items);

    for (let i = 0; i < filteredItems.length; i++) {
      const item = filteredItems[i] ?? "";
      const itemPath = path.join(dirPath, item);
      const isLast = i === items.length - 1;
      const stats = await fs.stat(itemPath);

      if (stats.isDirectory()) {
        output += await generateDirectoryTree(itemPath, ig, level + 1);
      } else {
        output += `${getIndent(level + 1, isLast)}${item}\n`;
      }
    }
    return output;
  } catch (error) {
    console.error(`Error reading directory: ${dirPath}`, error);
    return `Error reading directory: ${dirPath}: ${(error as Error).message}`;
  }
}

/**
 * Generates a string representation of a directory tree starting from the given path.
 * @param dirPath - The path of the directory to generate the tree for.
 * @returns A Promise that resolves to a string representation of the directory tree.
 */
export async function directoryTree(dirPath: string): Promise<string> {
  let ig: Ignore;
  try {
    const ignoreFile = await fs.readFile(
      path.join(process.cwd(), ".gitignore"),
    );
    ig = ignore().add(ignoreFile.toString()).add(".git");
  } catch (_error) {
    // If .gitignore doesn't exist, create basic ignore with just .git
    ig = ignore().add(".git");
  }
  return (await generateDirectoryTree(dirPath, ig)).trim();
}

interface FileSystemOptions {
  workingDir: string;
  terminal?: Terminal;
  sendData?: SendData | undefined;
  tokenCounter: TokenCounter;
}

const fileEncodingSchema = z.enum([
  "ascii",
  "utf8",
  "utf-8",
  "utf16le",
  "ucs2",
  "ucs-2",
  "base64",
  "base64url",
  "latin1",
  "binary",
  "hex",
]);

export const createFileSystemTools = async ({
  workingDir,
  terminal,
  sendData,
  tokenCounter,
}: FileSystemOptions) => {
  // Store allowed directories in normalized form
  const allowedDirectory = normalizePath(path.resolve(expandHome(workingDir)));

  // Validate that all directories exist and are accessible
  await Promise.all(
    [workingDir].map(async (dir) => {
      try {
        const stats = await fs.stat(dir);
        if (!stats.isDirectory()) {
          console.error(`Error: ${dir} is not a directory`);
          process.exit(1);
        }
      } catch (error) {
        console.error(`Error accessing directory ${dir}:`, error);
        process.exit(1);
      }
    }),
  );

  return {
    readFile: tool({
      description:
        "Read the complete contents of a file from the file system unless startLine and lineCount are given to read a file selection. " +
        "Handles various text encodings and provides detailed error messages " +
        "if the file cannot be read. Use this tool when you need to examine " +
        "the contents of a single file. Only works within allowed directories.",
      parameters: z.object({
        path: z.string().describe("Absolute path to file to read"),
        encoding: fileEncodingSchema.describe(
          'Encoding format for reading the file. Use "utf-8" as default for text files',
        ),
        startLine: z
          .number()
          .nullable()
          .describe(
            "1-based line number to start reading from. Pass null to start at beginning of file",
          ),
        lineCount: z
          .number()
          .nullable()
          .describe(
            "Maximum number of lines to read. Pass null to get all lines.",
          ),
      }),
      execute: async ({
        path: providedPath,
        encoding,
        startLine,
        lineCount,
      }) => {
        const id = crypto.randomUUID();
        sendData?.({
          id,
          event: "tool-init",
          data: `Reading file: ${providedPath}`,
        });
        try {
          const filePath = await validatePath(
            joinWorkingDir(providedPath, workingDir),
            allowedDirectory,
          );

          let file = await fs.readFile(filePath, { encoding });

          // Apply line-based selection if requested
          if (isNumber(startLine) || isNumber(lineCount)) {
            const lines = file.split("\n");
            const totalLines = lines.length;

            const startIndex = (startLine ?? 1) - 1; // Default to start of file if only lineCount is given
            const count = lineCount ?? totalLines - startIndex; // Default to read all lines from start if only startLine is given

            if (startIndex < 0 || startIndex >= totalLines) {
              return `startLine ${startLine} is out of bounds for file with ${totalLines} lines.`;
            }

            const endIndex = Math.min(startIndex + count, totalLines);
            file = lines.slice(startIndex, endIndex).join("\n");
          }
          let tokenCount = 0;
          try {
            // Only calculate tokens for non-image files and if encoding is text-based
            if (encoding.startsWith("utf")) {
              tokenCount = tokenCounter.count(file);
            }
          } catch (tokenError) {
            console.error("Error calculating token count:", tokenError);
            // Log or handle error, but don't block file return
          }

          const maxTokens = (await config.readProjectConfig()).tools.maxTokens;
          // Adjust max token check message if line selection was used
          const maxTokenMessage =
            isNumber(startLine) || isNumber(lineCount)
              ? `Selected file content (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Consider adjusting startLine/lineCount or using grepFiles.`
              : `File content (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Please use startLine and lineCount parameters to read specific portions of the file, or using grepFiles to search for specific content.`;

          const result = tokenCount <= maxTokens ? file : maxTokenMessage;

          sendData?.({
            id,
            event: "tool-completion",
            // Include token count only if calculated (i.e., for text files)
            data:
              tokenCount <= maxTokens
                ? `File read successfully: ${providedPath}${tokenCount > 0 ? ` (${tokenCount} tokens)` : ""}`
                : result,
          });
          return result;
        } catch (error) {
          return `Failed to read file: ${(error as Error).message}`;
        }
      },
    }),

    readMultipleFiles: tool({
      description:
        "Read the contents of multiple files simultaneously. This is more " +
        "efficient than reading files one by one when you need to analyze " +
        "or compare multiple files. Each file's content is returned with its " +
        "path as a reference. Failed reads for individual files won't stop " +
        "the entire operation. Only works within allowed directories.",
      parameters: z.object({
        paths: z.array(z.string()),
      }),
      execute: async ({ paths }) => {
        const id = crypto.randomUUID();
        sendData?.({
          id,
          event: "tool-init",
          data: `Reading files: ${paths.join(", ")}`,
        });
        const maxTokens = (await config.readProjectConfig()).tools.maxTokens;
        const results = await Promise.all(
          paths.map(async (filePath) => {
            try {
              const validPath = await validatePath(
                joinWorkingDir(filePath, workingDir),
                allowedDirectory,
              );
              const content = await fs.readFile(validPath, "utf-8");
              let tokenCount = 0;
              try {
                tokenCount = tokenCounter.count(content);
              } catch (tokenError) {
                console.error("Error calculating token count:", tokenError);
                // Handle token calculation error if needed
              }

              const maxTokenMessage = `File content (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Use readFile with startLine/lineCount or grepFiles for targeted access.`;

              const finalContent =
                tokenCount > maxTokens ? maxTokenMessage : content;
              const actualTokenCount = tokenCount > maxTokens ? 0 : tokenCount; // Don't count tokens for skipped files

              return {
                path: filePath,
                content: finalContent,
                tokenCount: actualTokenCount,
                error: null,
              };
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              return {
                path: filePath,
                content: null,
                tokenCount: 0,
                error: errorMessage,
              };
            }
          }),
        );
        let totalTokens = 0;
        let filesReadCount = 0;
        const formattedResults = results.map((result) => {
          if (result.error) {
            return `${result.path}: Error - ${result.error}`;
          }
          // Check if tokenCount is > 0, meaning it wasn't skipped
          if (result.tokenCount > 0) {
            filesReadCount++;
          }
          totalTokens += result.tokenCount; // Add the token count (will be 0 for skipped files)
          // Return content (or max token message)
          return `${result.path}:\n${result.content}\n`;
        });
        const completionMessage =
          filesReadCount === paths.length
            ? `Read ${paths.length} files successfully (${totalTokens} total tokens).`
            : `Read ${filesReadCount} of ${paths.length} files successfully (${totalTokens} total tokens). Files exceeding token limit were skipped.`;

        sendData?.({
          id,
          event: "tool-completion",
          data: completionMessage,
        });
        return formattedResults.join("\n---\n");
      },
    }),

    editFile: tool({
      description:
        "Make line-based edits to a text file. Each edit replaces exact line sequences " +
        "with new content. Creates a backup file (.backup) before saving changes. " +
        "Returns a git-style diff showing the changes made. " +
        "Only works within allowed directories.",
      parameters: z.object({
        path: z.string().describe("The path of the file to edit."),
        edits: z.array(
          z.object({
            oldText: z
              .string()
              .describe(
                "Text to search for - must match exactly and enough context must be provided to uniquely match the target text",
              ),
            newText: z.string().describe("Text to replace with"),
          }),
        ),
      }),
      execute: async ({ path, edits }) => {
        const id = crypto.randomUUID();
        sendData?.({
          id,
          event: "tool-init",
          data: `Editing file: ${path}`,
        });
        try {
          const validPath = await validatePath(
            joinWorkingDir(path, workingDir),
            allowedDirectory,
          );

          if (terminal) {
            terminal.lineBreak();

            terminal.writeln(`\n${chalk.blue.bold("●")} Editing file: ${path}`);

            terminal.lineBreak();

            const result = await applyFileEdits(validPath, edits, true);

            terminal.writeln(
              `The agent is proposing the following ${edits.length} edits:`,
            );

            terminal.lineBreak();

            terminal.display(result);

            terminal.lineBreak();

            const acceptEdits = await confirm({
              message: "Accept these changes?",
              default: false,
            });

            terminal.lineBreak();

            if (acceptEdits) {
              const finalEdits = await applyFileEdits(validPath, edits, false);
              // Send completion message indicating success
              sendData?.({
                id,
                event: "tool-completion",
                data: "Edits accepted and applied successfully.",
              });
              return finalEdits;
            }

            const reason = await input({ message: "Feedback: " });

            terminal.lineBreak();

            // Send completion message indicating rejection
            sendData?.({
              id,
              event: "tool-completion",
              data: `Edits rejected by user. Reason: ${reason}`,
            });
            return `The user rejected these changes. Reason: ${reason}`;
          }
          const finalEdits = await applyFileEdits(validPath, edits, false);
          // Send completion message indicating success
          sendData?.({
            id,
            event: "tool-completion",
            data: "Edits accepted and applied successfully.",
          });
          return finalEdits;
        } catch (error) {
          sendData?.({
            event: "tool-error",
            id: id,
            data: `Failed to edit file: ${(error as Error).message}`,
          });
          return `Failed to edit file: ${(error as Error).message}`;
        }
      },
    }),

    undoEdit: tool({
      description:
        "Reverts the last edit made to a file using the editFile tool by restoring from its backup file (.backup).",
      parameters: z.object({
        path: z
          .string()
          .describe("The path to the file whose last edit should be undone."),
      }),
      execute: async ({ path: userPath }) => {
        const id = crypto.randomUUID();
        sendData?.({
          id,
          event: "tool-init",
          data: `Undoing edit for file: ${userPath}`,
        });
        try {
          const filePath = await validatePath(
            joinWorkingDir(userPath, workingDir),
            allowedDirectory,
          );
          const backupPath = `${filePath}.backup`;

          // Check if backup file exists
          if (!existsSync(backupPath)) {
            return `No backup file found for ${filePath}`;
          }

          // Check if original file exists (it should, but good practice)
          if (!existsSync(filePath)) {
            return `Original file not found: ${filePath}`;
          }

          // Restore from backup
          const backupContent = await fs.readFile(backupPath, "utf8");
          await fs.writeFile(filePath, backupContent);

          // Remove backup content (but keep file for tracking purposes)
          await fs.writeFile(backupPath, "");

          sendData?.({
            id,
            event: "tool-completion",
            data: `Successfully restored ${userPath} from backup.`,
          });
          return `Successfully restored ${filePath} from backup`;
        } catch (error) {
          const errorMessage = `Error restoring from backup: ${(error as Error).message}`;
          sendData?.({
            id,
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),

    saveFile: tool({
      description:
        "Create a new file or completely overwrite an existing file with new content. " +
        "Use with caution as it will overwrite existing files without warning. " +
        "Handles text content with proper encoding. Only works within allowed directories.",
      parameters: z.object({
        path: z.string().describe("Absolute path to file to save to"),
        content: z.string().describe("Content to save in the file"),
        encoding: fileEncodingSchema.describe(
          'Encoding format for saving the file. Use "utf-8" as default for text files',
        ),
      }),
      execute: async ({ path: userPath, content, encoding }) => {
        const id = crypto.randomUUID();
        sendData?.({
          id,
          event: "tool-init",
          data: `Saving file: ${userPath}`,
        });
        try {
          const filePath = await validatePath(
            joinWorkingDir(userPath, workingDir),
            allowedDirectory,
          );
          await fs.writeFile(filePath, content, { encoding });
          sendData?.({
            id,
            event: "tool-completion",
            data: `File saved successfully: ${userPath}`,
          });
          return `File saved successfully: ${filePath}`;
        } catch (error) {
          return `Failed to save file: ${(error as Error).message}`;
        }
      },
    }),

    moveFile: tool({
      description:
        "Move or rename files and directories. Can move files between directories " +
        "and rename them in a single operation. If the destination exists, the " +
        "operation will fail. Works across different directories and can be used " +
        "for simple renaming within the same directory. Both source and destination must be within allowed directories.",
      parameters: z.object({
        source: z.string(),
        destination: z.string(),
      }),
      execute: async ({ source, destination }) => {
        const id = crypto.randomUUID();
        try {
          sendData?.({
            id,
            event: "tool-init",
            data: `Moving file from ${source} to ${destination}`,
          });
          const validSourcePath = await validatePath(
            joinWorkingDir(source, workingDir),
            allowedDirectory,
          );
          const validDestPath = await validatePath(
            joinWorkingDir(destination, workingDir),
            allowedDirectory,
          );
          await fs.rename(validSourcePath, validDestPath);
          sendData?.({
            id,
            event: "tool-completion",
            data: "Done",
          });
          return `Successfully moved ${source} to ${destination}`;
        } catch (error) {
          return `Failed to move file: ${(error as Error).message}`;
        }
      },
    }),

    directoryTree: tool({
      description:
        "Get a directory tree structure for a given path. This tool will ignore any directories or files listed in a .gitignore file. Use this tool when you need to see a complete directory tree for a project. This can be used to get an understanding of how a project is organized and what files are available before using other file system tools.",
      parameters: z.object({
        path: z.string().describe("The path."),
      }),
      execute: async ({ path }) => {
        const id = crypto.randomUUID();
        try {
          sendData?.({
            id,
            event: "tool-init",
            data: `Listing directory tree: ${path}`,
          });
          const validPath = await validatePath(
            joinWorkingDir(path, workingDir),
            allowedDirectory,
          );
          sendData?.({
            id,
            event: "tool-completion",
            data: "Done",
          });
          return directoryTree(validPath);
        } catch (error) {
          return `Failed to show directory tree: ${(error as Error).message}`;
        }
      },
    }),

    deleteFile: tool({
      description:
        "Delete a file. Creates a backup (.backup) before deleting, allowing for potential restoration.",
      parameters: z.object({
        path: z.string().describe("Absolute path to the file to delete"),
      }),
      execute: async ({ path: userPath }) => {
        const id = crypto.randomUUID();
        sendData?.({
          id,
          event: "tool-init",
          data: `Deleting file: ${userPath}`,
        });
        try {
          const filePath = await validatePath(
            joinWorkingDir(userPath, workingDir),
            allowedDirectory,
          );

          // Check if file exists before attempting backup/delete
          if (!existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
          }

          // Ensure it's a file, not a directory
          const stats = await fs.stat(filePath);
          if (stats.isDirectory()) {
            throw new Error(`Path is a directory, not a file: ${filePath}`);
          }

          // Create backup before deleting
          const backupPath = `${filePath}.backup`;
          await fs.copyFile(filePath, backupPath);

          // Delete the original file
          await fs.unlink(filePath);

          sendData?.({
            id,
            event: "tool-completion",
            data: `File deleted successfully: ${userPath}. Backup created at ${backupPath}`,
          });
          return `Successfully deleted ${filePath}. Backup created at ${backupPath}`;
        } catch (error) {
          const errorMessage = `Failed to delete file: ${(error as Error).message}`;
          sendData?.({
            id,
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),
  };
};
