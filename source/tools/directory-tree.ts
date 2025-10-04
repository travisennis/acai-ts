import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { config } from "../config.ts";
import style from "../terminal/style.ts";
import type { TokenCounter } from "../tokens/counter.ts";
import { manageOutput } from "../tokens/manage-output.ts";
import ignore, { type Ignore } from "../utils/ignore.ts";
import { joinWorkingDir, validatePath } from "./filesystem-utils.ts";
import type { SendData } from "./types.ts";

export const DirectoryTreeTool = {
  name: "directoryTree" as const,
};

export const createDirectoryTreeTool = async ({
  workingDir,
  sendData,
  tokenCounter,
}: {
  workingDir: string;
  sendData?: SendData;
  tokenCounter: TokenCounter;
}) => {
  const allowedDirectory = workingDir;
  return {
    [DirectoryTreeTool.name]: tool({
      description:
        "Get a directory tree structure for a given path. This tool will ignore any directories or files listed in a .gitignore file. Use this tool when you need to see a complete directory tree for a project. This can be used to get an understanding of how a project is organized and what files are available before using other file system tools.",
      inputSchema: z.object({
        path: z.string().describe("The path."),
      }),
      execute: async ({ path }, { toolCallId, abortSignal }) => {
        // Check if execution has been aborted
        if (abortSignal?.aborted) {
          throw new Error("Directory tree listing aborted");
        }
        let validPath: string;
        try {
          if (abortSignal?.aborted) {
            throw new Error(
              "Directory tree listing aborted before path validation",
            );
          }

          sendData?.({
            id: toolCallId,
            event: "tool-init",
            data: `Listing directory tree: ${style.cyan(path)}`,
          });

          validPath = await validatePath(
            joinWorkingDir(path, workingDir),
            allowedDirectory,
            { abortSignal },
          );

          const maxTokens = (await config.readProjectConfig()).tools.maxTokens;

          const rawTree = await directoryTree(validPath);
          const managed = manageOutput(rawTree, {
            tokenCounter,
            threshold: maxTokens,
          });

          if (managed.truncated) {
            sendData?.({
              id: toolCallId,
              event: "tool-update",
              data: { primary: managed.warning },
            });
          }

          sendData?.({
            id: toolCallId,
            event: "tool-completion",
            data: `Done (${managed.tokenCount} tokens)`,
          });
          return managed.content;
        } catch (error) {
          sendData?.({
            id: toolCallId,
            event: "tool-error",
            data: "Failed to show directory tree.",
          });
          return `Failed to show directory tree: ${(error as Error).message}`;
        }
      },
    }),
  };
};

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
  const name = path.basename(dirPath);
  let output = `${getIndent(level, false)}${name}\n`;

  const items = await fs.readdir(dirPath);
  const filteredItems = ig.filter(items);

  for (let i = 0; i < filteredItems.length; i++) {
    const item = filteredItems[i] ?? "";
    const itemPath = path.join(dirPath, item);
    const isLast = i === filteredItems.length - 1;
    const stats = await fs.stat(itemPath);

    if (stats.isDirectory()) {
      output += await generateDirectoryTree(itemPath, ig, level + 1);
    } else {
      output += `${getIndent(level + 1, isLast)}${item}\n`;
    }
  }
  return output;
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
