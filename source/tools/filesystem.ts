import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { tool } from "ai";
import { createTwoFilesPatch } from "diff";
import ignore, { type Ignore } from "ignore";
// import { minimatch } from "minimatch";
import { z } from "zod";
import { countTokens } from "../token-utils.ts";
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

// function matchesPatternHybrid(
//   pattern: string,
//   relativePath: string,
//   fileName: string,
//   fullPath: string,
// ): boolean {
//   const globChars = ["*", "?", "[", "]", "{", "}", "!", "+", "@", "(", ")"];
//   const isGlob = globChars.some((c) => pattern.includes(c));

//   if (isGlob) {
//     return minimatch(relativePath, pattern, { dot: true });
//   }

//   const patternLower = pattern.toLowerCase();
//   return (
//     fileName.toLowerCase().includes(patternLower) ||
//     relativePath.toLowerCase().includes(patternLower) ||
//     fullPath.toLowerCase().includes(patternLower)
//   );
// }

// async function searchFiles(
//   rootPath: string,
//   pattern: string,
//   allowedDirectory: string,
//   excludePatterns: string[] = [],
// ): Promise<string[]> {
//   const results: string[] = [];

//   // Setup ignore patterns from .gitignore
//   let ig: Ignore;
//   try {
//     const ignoreFile = await fs.readFile(path.join(rootPath, ".gitignore"));
//     ig = ignore().add(ignoreFile.toString()).add(".git");
//   } catch (_error) {
//     // If .gitignore doesn't exist, create basic ignore with just .git
//     ig = ignore().add(".git");
//   }

//   async function search(currentPath: string) {
//     const entries = await fs.readdir(currentPath, { withFileTypes: true });

//     for (const entry of entries) {
//       const fullPath = path.join(currentPath, entry.name);
//       try {
//         // Validate each path before processing
//         await validatePath(
//           joinWorkingDir(fullPath, allowedDirectory),
//           allowedDirectory,
//         );

//         // Check if path should be ignored based on .gitignore
//         const relativePath = path.relative(rootPath, fullPath);
//         const isIgnored = ig.ignores(relativePath);
//         if (isIgnored) {
//           continue;
//         }

//         // Check if path matches any exclude pattern
//         const shouldExclude = excludePatterns.some((pattern) => {
//           const globPattern = pattern.includes("*")
//             ? pattern
//             : `**/${pattern}/**`;
//           const isExcluded = minimatch(relativePath, globPattern, {
//             dot: true,
//           });
//           return isExcluded;
//         });

//         if (shouldExclude) {
//           continue;
//         }

//         // Check if the file matches the pattern - use full path to check for paths like "./acai/rules.md"
//         // or just the name for simple filename searches
//         if (matchesPatternHybrid(pattern, relativePath, entry.name, fullPath)) {
//           results.push(fullPath);
//         }

//         if (entry.isDirectory()) {
//           await search(fullPath);
//         }
//       } catch (error) {
//         console.error(error);
//       }
//     }
//   }

//   // being the search
//   await search(rootPath);

//   // return the results
//   return results;
// }

// interface FileStats {
//   size: number;
//   created: Date;
//   modified: Date;
//   accessed: Date;
//   isDirectory: boolean;
//   isFile: boolean;
//   permissions: string;
// }

// async function getFileStats(filePath: string): Promise<FileStats> {
//   const stats = await fs.stat(filePath);
//   return {
//     size: stats.size,
//     created: stats.birthtime,
//     modified: stats.mtime,
//     accessed: stats.atime,
//     isDirectory: stats.isDirectory(),
//     isFile: stats.isFile(),
//     permissions: stats.mode.toString(8).slice(-3),
//   };
// }

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

const INDENT_REGEX = /^\s*/;

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
  // Read file content and normalize line endings
  const content = normalizeLineEndings(await fs.readFile(filePath, "utf-8"));

  // Apply edits sequentially
  let modifiedContent = content;
  for (const edit of edits) {
    const normalizedOld = normalizeLineEndings(edit.oldText);
    const normalizedNew = normalizeLineEndings(edit.newText);

    // If exact match exists, use it
    if (modifiedContent.includes(normalizedOld)) {
      modifiedContent = modifiedContent.replace(normalizedOld, normalizedNew);
      continue;
    }

    // Otherwise, try line-by-line matching with flexibility for whitespace
    const oldLines = normalizedOld.split("\n");
    const contentLines = modifiedContent.split("\n");
    let matchFound = false;

    for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
      const potentialMatch = contentLines.slice(i, i + oldLines.length);

      // Compare lines with normalized whitespace
      const isMatch = oldLines.every((oldLine, j) => {
        const contentLine = potentialMatch[j] ?? "";
        return oldLine.trim() === contentLine.trim();
      });

      if (isMatch) {
        // Preserve original indentation of first line
        const originalIndent = contentLines[i]?.match(INDENT_REGEX)?.[0] || "";
        const newLines = normalizedNew.split("\n").map((line, j) => {
          if (j === 0) {
            return originalIndent + line.trimStart();
          }

          // For subsequent lines, try to preserve relative indentation
          const oldIndent = oldLines[j]?.match(INDENT_REGEX)?.[0] || "";
          const newIndent = line.match(INDENT_REGEX)?.[0] || "";
          if (oldIndent && newIndent) {
            const relativeIndent = newIndent.length - oldIndent.length;
            return (
              originalIndent +
              " ".repeat(Math.max(0, relativeIndent)) +
              line.trimStart()
            );
          }
          return line;
        });

        contentLines.splice(i, oldLines.length, ...newLines);
        modifiedContent = contentLines.join("\n");
        matchFound = true;
        break;
      }
    }

    if (!matchFound) {
      throw new Error(`Could not find exact match for edit:\n${edit.oldText}`);
    }
  }

  // Create unified diff
  const diff = createUnifiedDiff(content, modifiedContent, filePath);

  // Format diff with appropriate number of backticks
  let numBackticks = 3;
  while (diff.includes("`".repeat(numBackticks))) {
    numBackticks++;
  }
  const formattedDiff = `${"`".repeat(numBackticks)}diff\n${diff}${"`".repeat(numBackticks)}\n\n`;

  if (!dryRun) {
    // Create backup before writing changes
    await backupFile(filePath);
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
    const ignoreFile = await fs.readFile(path.join(dirPath, ".gitignore"));
    ig = ignore().add(ignoreFile.toString()).add(".git");
  } catch (_error) {
    console.error(_error);
    // If .gitignore doesn't exist, create basic ignore with just .git
    ig = ignore().add(".git");
  }
  return (await generateDirectoryTree(dirPath, ig)).trim();
}

interface FileSystemOptions {
  workingDir: string;
  sendData?: SendData | undefined;
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

export const FS_READ_ONLY = [
  // "currentDirectory",
  "readFile",
  // "readMultipleFiles",
  // "searchFiles",
  // "getFileInfo",
  // "listDirectory",
  "directoryTree",
] as const;

export const createFileSystemTools = async ({
  workingDir,
  sendData,
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
    // currentDirectory: tool({
    //   description:
    //     "Get the current working directory. Use this to understand which directory is available before trying to access files.",
    //   parameters: z.object({}),
    //   execute: () => {
    //     const id = crypto.randomUUID();
    //     sendData?.({
    //       id,
    //       event: "tool-init",
    //       data: "Getting current working directory",
    //     });
    //     sendData?.({
    //       id,
    //       event: "tool-completion",
    //       data: `Current working directory: ${workingDir}`,
    //     });
    //     return Promise.resolve(workingDir);
    //   },
    // }),

    // createDirectory: tool({
    //   description:
    //     "Create a new directory or ensure a directory exists. Can create multiple " +
    //     "nested directories in one operation. If the directory already exists, " +
    //     "this operation will succeed silently. Perfect for setting up directory " +
    //     "structures for projects or ensuring required paths exist. Only works within allowed directories.",
    //   parameters: z.object({
    //     path: z.string().describe("Absolute path to directory to create"),
    //   }),
    //   execute: async ({ path: dirPath }) => {
    //     const id = crypto.randomUUID();
    //     sendData?.({
    //       id,
    //       event: "tool-init",
    //       data: `Creating directory: ${dirPath}`,
    //     });
    //     try {
    //       const validPath = await validatePath(
    //         joinWorkingDir(dirPath, workingDir),
    //         allowedDirectory,
    //       );
    //       await fs.mkdir(validPath, { recursive: true });
    //       sendData?.({
    //         id,
    //         event: "tool-completion",
    //         data: `Directory created successfully: ${dirPath}`,
    //       });
    //       return `Successfully created directory ${dirPath}`;
    //     } catch (error) {
    //       const errorMessage = `Failed to create directory: ${(error as Error).message}`;
    //       sendData?.({
    //         id,
    //         event: "tool-error",
    //         data: errorMessage,
    //       });
    //       return errorMessage;
    //     }
    //   },
    // }),

    readFile: tool({
      description:
        "Read the complete contents of a file from the file system unless startLine and lineCount are given to read a file selection. " +
        "Handles various text encodings and provides detailed error messages " +
        "if the file cannot be read. Use this tool when you need to examine " +
        "the contents of a single file. Only works within allowed directories.",
      parameters: z.object({
        path: z.string().describe("Absolute path to file to read"),
        isImage: z.boolean().describe("Specify if the file is an image"),
        encoding: fileEncodingSchema.describe(
          'Encoding format for reading the file. Use "utf-8" as default for text files',
        ),
        startLine: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("1-based line number to start reading from"),
        lineCount: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Maximum number of lines to read"),
      }),
      execute: async ({
        path: userPath,
        isImage,
        encoding,
        startLine,
        lineCount,
      }) => {
        const id = crypto.randomUUID();
        sendData?.({
          id,
          event: "tool-init",
          data: `Reading file: ${userPath}`,
        });
        try {
          const filePath = await validatePath(
            joinWorkingDir(userPath, workingDir),
            allowedDirectory,
          );

          if (isImage && (startLine !== undefined || lineCount !== undefined)) {
            return "Line-based reading (startLine/lineCount) is not supported for images.";
          }

          let file = await fs.readFile(filePath, { encoding });

          // Apply line-based selection if requested
          if (startLine !== undefined || lineCount !== undefined) {
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
            if (!isImage && encoding.startsWith("utf")) {
              tokenCount = countTokens(file);
            }
          } catch (tokenError) {
            console.error("Error calculating token count:", tokenError);
            // Log or handle error, but don't block file return
          }

          const maxTokens = 15000;
          // Adjust max token check message if line selection was used
          const maxTokenMessage =
            startLine !== undefined || lineCount !== undefined
              ? `Selected file content (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Consider adjusting startLine/lineCount or using grepFiles.`
              : `File content (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Please use startLine and lineCount parameters to read specific portions of the file, or using grepFiles to search for specific content.`;

          const result = tokenCount <= maxTokens ? file : maxTokenMessage;

          sendData?.({
            id,
            event: "tool-completion",
            // Include token count only if calculated (i.e., for text files)
            data:
              tokenCount <= maxTokens
                ? `File read successfully: ${userPath}${tokenCount > 0 ? ` (${tokenCount} tokens)` : ""}`
                : result,
          });
          if (isImage) {
            return `data:image/${path
              .extname(filePath)
              .toLowerCase()
              .replace(
                ".",
                "",
              )};base64,${Buffer.from(file).toString("base64")}`;
          }
          return result;
        } catch (error) {
          return `Failed to read file: ${(error as Error).message}`;
        }
      },
    }),

    // readMultipleFiles: tool({
    //   description:
    //     "Read the contents of multiple files simultaneously. This is more " +
    //     "efficient than reading files one by one when you need to analyze " +
    //     "or compare multiple files. Each file's content is returned with its " +
    //     "path as a reference. Failed reads for individual files won't stop " +
    //     "the entire operation. Only works within allowed directories.",
    //   parameters: z.object({
    //     paths: z.array(z.string()),
    //   }),
    //   execute: async ({ paths }) => {
    //     const id = crypto.randomUUID();
    //     sendData?.({
    //       id,
    //       event: "tool-init",
    //       data: `Reading files: ${paths.join(", ")}`,
    //     });
    //     const results = await Promise.all(
    //       paths.map(async (filePath) => {
    //         try {
    //           const validPath = await validatePath(
    //             joinWorkingDir(filePath, workingDir),
    //             allowedDirectory,
    //           );
    //           const content = await fs.readFile(validPath, "utf-8");
    //           let tokenCount = 0;
    //           try {
    //             tokenCount = countTokens(content);
    //           } catch (tokenError) {
    //             console.error("Error calculating token count:", tokenError);
    //             // Handle token calculation error if needed
    //           }
    //           return { path: filePath, content, tokenCount, error: null };
    //         } catch (error) {
    //           const errorMessage =
    //             error instanceof Error ? error.message : String(error);
    //           return {
    //             path: filePath,
    //             content: null,
    //             tokenCount: 0,
    //             error: errorMessage,
    //           };
    //         }
    //       }),
    //     );
    //     let totalTokens = 0;
    //     const formattedResults = results.map((result) => {
    //       if (result.error) {
    //         return `${result.path}: Error - ${result.error}`;
    //       }
    //       totalTokens += result.tokenCount;
    //       // Return only content, not token count in the result string
    //       return `${result.path}:\n${result.content}\n`;
    //     });
    //     sendData?.({
    //       id,
    //       event: "tool-completion",
    //       data: `Read ${paths.length} files successfully (${totalTokens} total tokens).`,
    //     });
    //     return formattedResults.join("\n---\n");
    //   },
    // }),

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
              .min(1)
              .describe(
                "Text to search for - must match exactly and enough context must be provided to uniquely match the target text",
              ),
            newText: z.string().describe("Text to replace with"),
          }),
        ),
        dryRun: z
          .boolean()
          .default(false)
          .describe(
            "Preview changes using git-style diff format: true or false",
          ),
      }),
      execute: async ({ path, edits, dryRun }) => {
        const uuid = crypto.randomUUID();
        try {
          sendData?.({
            event: "tool-init",
            id: uuid,
            data: `Editing file: ${path}`,
          });
          const validPath = await validatePath(
            joinWorkingDir(path, workingDir),
            allowedDirectory,
          );
          const result = await applyFileEdits(validPath, edits, dryRun);
          if (dryRun) {
            sendData?.({
              event: "tool-update",
              id: uuid,
              data: {
                primary: `Proposing ${edits.length} edits`,
                secondary: [result],
              },
            });
            sendData?.({
              event: "tool-completion",
              id: uuid,
              data: "Done",
            });
          } else {
            sendData?.({
              event: "tool-completion",
              id: uuid,
              data: `Applied ${edits.length} edits. Backup created at ${validPath}.backup`,
            });
          }
          return result;
        } catch (error) {
          sendData?.({
            event: "tool-error",
            id: uuid,
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

    // searchFiles: tool({
    //   description:
    //     "Recursively search for files and directories matching a pattern. " +
    //     "Searches through all subdirectories from the starting path. The search " +
    //     "is case-insensitive and matches partial names. Returns full paths to all " +
    //     "matching items. Great for finding files when you don't know their exact location. " +
    //     "Only searches within allowed directories. Use this tool when you need to find files by name patterns.",
    //   parameters: z.object({
    //     path: z.string().describe("The base path to search in."),
    //     pattern: z
    //       .string()
    //       .describe('Supports glob patterns like "**/*.js" or "src/**/*.ts"'),
    //     excludePatterns: z.array(z.string()).optional().default([]),
    //   }),
    //   execute: async ({ path, pattern, excludePatterns }) => {
    //     const id = crypto.randomUUID();
    //     try {
    //       sendData?.({
    //         id,
    //         event: "tool-init",
    //         data: `Search for '${pattern}' in ${path}`,
    //       });
    //       const validPath = await validatePath(
    //         joinWorkingDir(path, workingDir),
    //         allowedDirectory,
    //       );
    //       const results = await searchFiles(
    //         validPath,
    //         pattern,
    //         allowedDirectory,
    //         excludePatterns,
    //       );
    //       sendData?.({
    //         id,
    //         event: "tool-completion",
    //         data:
    //           results.length > 0
    //             ? `Found ${results.length} matches.`
    //             : "No matches found.",
    //       });
    //       return results.length > 0 ? results.join("\n") : "No matches found";
    //     } catch (error) {
    //       const errorMessage = `Failed to search files: ${(error as Error).message}`;
    //       sendData?.({
    //         id,
    //         event: "tool-error",
    //         data: errorMessage,
    //       });
    //       return errorMessage;
    //     }
    //   },
    // }),

    // getFileInfo: tool({
    //   description:
    //     "Retrieve detailed metadata about a file or directory. Returns comprehensive " +
    //     "information including size, creation time, last modified time, permissions, " +
    //     "and type. This tool is perfect for understanding file characteristics " +
    //     "without reading the actual content. Only works within allowed directories.",
    //   parameters: z.object({
    //     path: z.string(),
    //   }),
    //   execute: async ({ path }) => {
    //     const id = crypto.randomUUID();
    //     try {
    //       sendData?.({
    //         id,
    //         event: "tool-init",
    //         data: `Get file info: ${path}`,
    //       });
    //       const validPath = await validatePath(path, allowedDirectory);
    //       const info = await getFileStats(validPath);
    //       sendData?.({
    //         id,
    //         event: "tool-completion",
    //         data: "Done",
    //       });
    //       return Object.entries(info)
    //         .map(([key, value]) => `${key}: ${value}`)
    //         .join("\n");
    //     } catch (error) {
    //       return `Failed to get file info: ${(error as Error).message}`;
    //     }
    //   },
    // }),

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

    // listDirectory: tool({
    //   description:
    //     "Get a detailed listing of all files and directories in a specified path. " +
    //     "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
    //     "prefixes. This tool is essential for understanding directory structure and " +
    //     "finding specific files within a directory. Only works within allowed directories. Use this tool when you need to see the contents of a directory.",
    //   parameters: z.object({
    //     path: z.string().describe("The path."),
    //   }),
    //   execute: async ({ path }) => {
    //     const id = crypto.randomUUID();
    //     try {
    //       sendData?.({
    //         id,
    //         event: "tool-init",
    //         data: `Listing directory: ${path}`,
    //       });
    //       const validPath = await validatePath(
    //         joinWorkingDir(path, workingDir),
    //         allowedDirectory,
    //       );
    //       const entries = await fs.readdir(validPath, { withFileTypes: true });
    //       sendData?.({
    //         id,
    //         event: "tool-completion",
    //         data: "Done",
    //       });
    //       return entries
    //         .map(
    //           (entry) =>
    //             `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`,
    //         )
    //         .join("\n");
    //     } catch (error) {
    //       const errorMessage = `Failed to list directory: ${(error as Error).message}`;
    //       sendData?.({
    //         id,
    //         event: "tool-error",
    //         data: errorMessage,
    //       });
    //       return errorMessage;
    //     }
    //   },
    // }),

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
