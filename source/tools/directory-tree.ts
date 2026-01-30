import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { WorkspaceContext } from "../index.ts";
import style from "../terminal/style.ts";
import { toDisplayPath } from "../utils/filesystem/path-display.ts";
import { joinWorkingDir, validatePath } from "../utils/filesystem/security.ts";
import ignore, { type Ignore } from "../utils/ignore.ts";
import { convertNullString } from "../utils/zod.ts";
import type { ToolExecutionOptions } from "./types.ts";

const DEFAULT_ITEM_LIMIT = 500;
const DEFAULT_DEPTH_LIMIT = 10;

export const DirectoryTreeTool = {
  name: "DirectoryTree" as const,
};

const inputSchema = z.object({
  path: z.string().describe("The path"),
  maxResults: z
    .preprocess((val) => convertNullString(val), z.coerce.number().nullable())
    .describe(
      `Maximum number of items (files + directories) to return. Set to 0 for no limit. (default: ${DEFAULT_ITEM_LIMIT})`,
    ),
  maxDepth: z
    .preprocess((val) => convertNullString(val), z.coerce.number().nullable())
    .describe(
      `Maximum recursion depth. Set to 0 for no limit. (default: ${DEFAULT_DEPTH_LIMIT})`,
    ),
});

type DirectoryTreeInputSchema = z.infer<typeof inputSchema>;

export const createDirectoryTreeTool = async (options: {
  workspace: WorkspaceContext;
}) => {
  const { primaryDir, allowedDirs } = options.workspace;
  const allowedDirectory = allowedDirs ?? [primaryDir];
  return {
    toolDef: {
      description: `Get a directory tree structure for a given path. This tool will ignore any directories or files listed in a .gitignore file. Use this tool when you need to see a complete directory tree for a path in the allowed directories. This can be used to get an understanding of how a project is organized and what files are available before using other file system tools. Results are automatically limited to prevent overwhelming output. Default limits are ${DEFAULT_ITEM_LIMIT} items and ${DEFAULT_DEPTH_LIMIT} depth. Use maxResults and maxDepth parameters for better control over output size.`,
      inputSchema,
    },
    display({ path, maxDepth, maxResults }: DirectoryTreeInputSchema) {
      const displayPath = toDisplayPath(path);
      let display = `${style.cyan(displayPath)}`;
      if (maxDepth || maxResults) {
        const parts = [];
        if (maxDepth) parts.push(`depth: ${maxDepth}`);
        if (maxResults) parts.push(`max: ${maxResults}`);
        display += ` (${parts.join(", ")})`;
      }
      return display;
    },
    async execute(
      { path, maxResults, maxDepth }: DirectoryTreeInputSchema,
      { abortSignal }: ToolExecutionOptions,
    ): Promise<string> {
      if (abortSignal?.aborted) {
        throw new Error("Directory tree listing aborted");
      }

      const validPath = await validatePath(
        joinWorkingDir(path, primaryDir),
        allowedDirectory,
        { abortSignal },
      );

      if (abortSignal?.aborted) {
        throw new Error(
          "Directory tree listing aborted before tree generation",
        );
      }

      const treeResult = await directoryTree(validPath, {
        maxResults: maxResults ?? DEFAULT_ITEM_LIMIT,
        maxDepth: maxDepth ?? DEFAULT_DEPTH_LIMIT,
      });

      return treeResult.tree;
    },
  };
};

/**
 * Generates the indentation string for a given level in the directory tree.
 * @param level - The current level in the directory tree.
 * @param isLast - Indicates if the current item is the last in its parent directory.
 * @returns The indentation string for the current level.
 */
function getIndent(level: number, isLast: boolean): string {
  const indent = "│   ".repeat(Math.max(level - 1, 0));
  return level === 0 ? "" : `${indent}${isLast ? "└── " : "├── "}`;
}

/**
 * Recursively generates a string representation of a directory tree.
 * @param dirPath - The path of the directory to generate the tree for.
 * @param ig - The ignore instance for filtering files.
 * @param level - The current level in the directory tree (default: 0).
 * @param options - Options for limiting results.
 * @returns A Promise that resolves to a string representation of the directory tree with counts.
 * @throws Will log an error if there's an issue reading the directory.
 */
async function generateDirectoryTree(
  dirPath: string,
  ig: Ignore,
  level = 0,
  options: DirectoryTreeOptions = {},
): Promise<{
  tree: string;
  fileCount: number;
  directoryCount: number;
  totalCount: number;
  isTruncated: boolean;
}> {
  const name = path.basename(dirPath);
  let output = `${getIndent(level, false)}${name}\n`;

  let fileCount = 0;
  let directoryCount = 1; // Count the current directory
  let totalCount = 1; // Count the current directory
  let isTruncated = false;

  // Check maxDepth limit - when maxDepth is reached, we should indicate truncation
  if (
    options.maxDepth !== null &&
    options.maxDepth !== undefined &&
    options.maxDepth > 0 &&
    level >= options.maxDepth
  ) {
    // When maxDepth is reached, return with truncation flag set
    return {
      tree: output,
      fileCount: 0,
      directoryCount: 1, // Count the current directory
      totalCount: 1, // Count the current directory
      isTruncated: true, // Set truncation flag when depth limit is reached
    };
  }

  const items = await fs.readdir(dirPath);
  const filteredItems = ig.filter(items);

  for (let i = 0; i < filteredItems.length; i++) {
    // Check maxResults limit BEFORE processing each item to ensure strict adherence to limits
    if (
      options.maxResults !== null &&
      options.maxResults !== undefined &&
      options.maxResults > 0 &&
      totalCount >= options.maxResults
    ) {
      isTruncated = true;
      break;
    }

    const item = filteredItems[i] ?? "";
    const itemPath = path.join(dirPath, item);
    const isLast = i === filteredItems.length - 1;
    const stats = await fs.stat(itemPath);

    if (stats.isDirectory()) {
      const subTreeResult = await generateDirectoryTree(
        itemPath,
        ig,
        level + 1,
        options,
      );
      output += subTreeResult.tree;
      fileCount += subTreeResult.fileCount;
      directoryCount += subTreeResult.directoryCount;
      totalCount += subTreeResult.totalCount;
      // Propagate truncation from subtree results
      if (subTreeResult.isTruncated) {
        isTruncated = true;
      }
    } else {
      output += `${getIndent(level + 1, isLast)}${item}\n`;
      fileCount += 1;
      totalCount += 1;
    }
  }

  return { tree: output, fileCount, directoryCount, totalCount, isTruncated };
}

/**
 * Generates a string representation of a directory tree starting from the given path.
 * @param dirPath - The path of the directory to generate the tree for.
 * @returns A Promise that resolves to a string representation of the directory tree.
 */
interface DirectoryTreeOptions {
  maxResults?: number | null;
  maxDepth?: number | null;
}

interface DirectoryTreeResult {
  tree: string;
  fileCount: number;
  directoryCount: number;
  totalCount: number;
  isTruncated: boolean;
}

async function directoryTree(
  dirPath: string,
  options: DirectoryTreeOptions = {},
): Promise<DirectoryTreeResult> {
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

  const result = await generateDirectoryTree(dirPath, ig, 0, options);

  return {
    tree: result.tree.trim(),
    fileCount: result.fileCount,
    directoryCount: result.directoryCount,
    totalCount: result.totalCount,
    isTruncated: result.isTruncated,
  };
}
