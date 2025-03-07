import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { tool } from "ai";
import { createTwoFilesPatch } from "diff";
import ignore, { type Ignore } from "ignore";
import { minimatch } from "minimatch";
import { z } from "zod";
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
  allowedDirectories: string[],
): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);
  const normalizedRequested = normalizePath(absolute);

  // Check if path is within allowed directories
  const isAllowed = allowedDirectories.some((dir) =>
    normalizedRequested.startsWith(dir),
  );
  if (!isAllowed) {
    throw new Error(
      `Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(", ")}`,
    );
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    const isRealPathAllowed = allowedDirectories.some((dir) =>
      normalizedReal.startsWith(dir),
    );
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
      const isParentAllowed = allowedDirectories.some((dir) =>
        normalizedParent.startsWith(dir),
      );
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

async function searchFiles(
  rootPath: string,
  pattern: string,
  excludePatterns: string[] = [],
  allowedDirectories: string[] = [],
): Promise<string[]> {
  const results: string[] = [];

  async function search(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      try {
        // Validate each path before processing
        await validatePath(
          joinWorkingDir(fullPath, allowedDirectories.at(0) ?? ""),
          allowedDirectories,
        );

        // Check if path matches any exclude pattern
        const relativePath = path.relative(rootPath, fullPath);
        const shouldExclude = excludePatterns.some((pattern) => {
          const globPattern = pattern.includes("*")
            ? pattern
            : `**/${pattern}/**`;
          return minimatch(relativePath, globPattern, { dot: true });
        });

        if (shouldExclude) {
          continue;
        }

        if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
          results.push(fullPath);
        }

        if (entry.isDirectory()) {
          await search(fullPath);
        }
      } catch (_error) {
        // ignore
      }
    }
  }

  await search(rootPath);
  return results;
}

// Tool implementations
interface FileStats {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
}

async function getFileStats(filePath: string): Promise<FileStats> {
  const stats = await fs.stat(filePath);
  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    permissions: stats.mode.toString(8).slice(-3),
  };
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

const INDENT_REGEX = /^\s*/;

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
  sendData?: SendData;
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

export const READ_ONLY = [
  "currentDirectory",
  "readFile",
  "readMultipleFiles",
  "searchFiles",
  "getFileInfo",
  "listDirectory",
  "directoryTree",
] as const;

export const createFileSystemTools = async ({
  workingDir,
  sendData,
}: FileSystemOptions) => {
  // Store allowed directories in normalized form
  const allowedDirectories = [workingDir].map((dir) =>
    normalizePath(path.resolve(expandHome(dir))),
  );

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
    currentDirectory: tool({
      description:
        "Get the current working directory. Use this to understand which directory is available before trying to access files.",
      parameters: z.object({}),
      execute: () => {
        sendData?.({
          event: "tool-init",
          data: "Getting current working directory",
        });
        return Promise.resolve(workingDir);
      },
    }),

    createDirectory: tool({
      description:
        "Create a new directory or ensure a directory exists. Can create multiple " +
        "nested directories in one operation. If the directory already exists, " +
        "this operation will succeed silently. Perfect for setting up directory " +
        "structures for projects or ensuring required paths exist. Only works within allowed directories.",
      parameters: z.object({
        path: z.string().describe("Absolute path to directory to create"),
      }),
      execute: async ({ path: dirPath }) => {
        sendData?.({
          event: "tool-init",
          data: `Creating directory: ${dirPath}`,
        });
        try {
          const validPath = await validatePath(
            joinWorkingDir(dirPath, workingDir),
            allowedDirectories,
          );
          await fs.mkdir(validPath, { recursive: true });
          sendData?.({
            event: "tool-completion",
            data: `Directory created successfully: ${dirPath}`,
          });
          return `Successfully created directory ${dirPath}`;
        } catch (error) {
          const errorMessage = `Failed to create directory: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),

    readFile: tool({
      description:
        "Read the complete contents of a file from the file system. " +
        "Handles various text encodings and provides detailed error messages " +
        "if the file cannot be read. Use this tool when you need to examine " +
        "the contents of a single file. Only works within allowed directories.",
      parameters: z.object({
        path: z.string().describe("Absolute path to file to read"),
        isImage: z.boolean().describe("Specify if the file is an image"),
        encoding: fileEncodingSchema.describe(
          'Encoding format for reading the file. Use "utf-8" as default for text files',
        ),
      }),
      execute: async ({ path: userPath, isImage, encoding }) => {
        sendData?.({
          event: "tool-init",
          data: `Reading file: ${userPath}`,
        });
        try {
          const filePath = await validatePath(
            joinWorkingDir(userPath, workingDir),
            allowedDirectories,
          );
          const file = await fs.readFile(filePath, { encoding });
          sendData?.({
            event: "tool-completion",
            data: `File read successfully: ${userPath}`,
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
          return file;
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
        sendData?.({
          event: "tool-init",
          data: `Reading files: ${paths.join(", ")}`,
        });
        const results = await Promise.all(
          paths.map(async (filePath) => {
            try {
              const validPath = await validatePath(
                joinWorkingDir(filePath, workingDir),
                allowedDirectories,
              );
              const content = await fs.readFile(validPath, "utf-8");
              return `${filePath}:\n${content}\n`;
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              return `${filePath}: Error - ${errorMessage}`;
            }
          }),
        );
        return results.join("\n---\n");
      },
    }),

    editFile: tool({
      description:
        "Make line-based edits to a text file. Each edit replaces exact line sequences " +
        "with new content. Returns a git-style diff showing the changes made. " +
        "Only works within allowed directories.",
      parameters: z.object({
        path: z.string(),
        edits: z.array(
          z.object({
            oldText: z
              .string()
              .describe("Text to search for - must match exactly"),
            newText: z.string().describe("Text to replace with"),
          }),
        ),
        dryRun: z
          .boolean()
          .default(false)
          .describe("Preview changes using git-style diff format"),
      }),
      execute: async ({ path, edits, dryRun }) => {
        try {
          sendData?.({
            event: "tool-init",
            data: `Editing file: ${path}`,
          });
          const validPath = await validatePath(
            joinWorkingDir(path, workingDir),
            allowedDirectories,
          );
          const result = await applyFileEdits(validPath, edits, dryRun);
          return result;
        } catch (error) {
          return `Failed to edit file: ${(error as Error).message}`;
        }
      },
    }),

    searchFiles: tool({
      description:
        "Recursively search for files and directories matching a pattern. " +
        "Searches through all subdirectories from the starting path. The search " +
        "is case-insensitive and matches partial names. Returns full paths to all " +
        "matching items. Great for finding files when you don't know their exact location. " +
        "Only searches within allowed directories. Use this tool when you need to find files by name patterns.",
      parameters: z.object({
        path: z.string().describe("The base path to search in."),
        pattern: z
          .string()
          .describe('Supports glob patterns like "**/*.js" or "src/**/*.ts"'),
        excludePatterns: z.array(z.string()).optional().default([]),
      }),
      execute: async ({ path, pattern, excludePatterns }) => {
        try {
          sendData?.({
            event: "tool-init",
            data: `Search for ${pattern}: ${path}`,
          });
          const validPath = await validatePath(
            joinWorkingDir(path, workingDir),
            allowedDirectories,
          );
          const results = await searchFiles(
            validPath,
            pattern,
            excludePatterns,
            allowedDirectories,
          );
          return results.length > 0 ? results.join("\n") : "No matches found";
        } catch (error) {
          const errorMessage = `Failed to search files: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),

    getFileInfo: tool({
      description:
        "Retrieve detailed metadata about a file or directory. Returns comprehensive " +
        "information including size, creation time, last modified time, permissions, " +
        "and type. This tool is perfect for understanding file characteristics " +
        "without reading the actual content. Only works within allowed directories.",
      parameters: z.object({
        path: z.string(),
      }),
      execute: async ({ path }) => {
        try {
          sendData?.({
            event: "tool-init",
            data: `Get file info: ${path}`,
          });
          const validPath = await validatePath(path, allowedDirectories);
          const info = await getFileStats(validPath);
          return Object.entries(info)
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n");
        } catch (error) {
          return `Failed to get file info: ${(error as Error).message}`;
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
        sendData?.({
          event: "tool-init",
          data: `Saving file: ${userPath}`,
        });
        try {
          const filePath = await validatePath(
            joinWorkingDir(userPath, workingDir),
            allowedDirectories,
          );
          await fs.writeFile(filePath, content, { encoding });
          sendData?.({
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
        try {
          sendData?.({
            event: "tool-init",
            data: `Moving file from ${source} to ${destination}`,
          });
          const validSourcePath = await validatePath(
            joinWorkingDir(source, workingDir),
            allowedDirectories,
          );
          const validDestPath = await validatePath(
            joinWorkingDir(destination, workingDir),
            allowedDirectories,
          );
          await fs.rename(validSourcePath, validDestPath);
          return `Successfully moved ${source} to ${destination}`;
        } catch (error) {
          return `Failed to move file: ${(error as Error).message}`;
        }
      },
    }),

    listDirectory: tool({
      description:
        "Get a detailed listing of all files and directories in a specified path. " +
        "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
        "prefixes. This tool is essential for understanding directory structure and " +
        "finding specific files within a directory. Only works within allowed directories. Use this tool when you need to see the contents of a directory.",
      parameters: z.object({
        path: z.string().describe("The path."),
      }),
      execute: async ({ path }) => {
        try {
          sendData?.({
            event: "tool-init",
            data: `Listing directory: ${path}`,
          });
          const validPath = await validatePath(
            joinWorkingDir(path, workingDir),
            allowedDirectories,
          );
          const entries = await fs.readdir(validPath, { withFileTypes: true });
          return entries
            .map(
              (entry) =>
                `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`,
            )
            .join("\n");
        } catch (error) {
          const errorMessage = `Failed to list directory: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
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
        try {
          sendData?.({
            event: "tool-init",
            data: `Listing directory tree: ${path}`,
          });
          const validPath = await validatePath(
            joinWorkingDir(path, workingDir),
            allowedDirectories,
          );
          return directoryTree(validPath);
        } catch (error) {
          return `Failed to show directory tree: ${(error as Error).message}`;
        }
      },
    }),
  };
};
