import fs from "node:fs/promises";
import path from "node:path";
import ignore from "ignore";
import logger from "./logger";

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
  level = 1,
): Promise<string> {
  const name = path.basename(dirPath);
  const ignoreFile = await fs.readFile("./.gitignore");
  const ig = ignore().add(ignoreFile.toString()).add(".git");
  let output = `${getIndent(level, false)}${name}\n`;

  try {
    const items = await fs.readdir(dirPath);
    const filteredItems = ig.filter(items);
    for (let i = 0; i < filteredItems.length; i++) {
      const item = filteredItems[i];
      const itemPath = path.join(dirPath, item);
      const isLast = i === items.length - 1;
      const stats = await fs.stat(itemPath);

      if (stats.isDirectory()) {
        output += await generateDirectoryTree(itemPath, level + 1);
      } else {
        output += `${getIndent(level + 1, isLast)}${item}\n`;
      }
    }
  } catch (error) {
    logger.error(`Error reading directory: ${dirPath}`, error);
  }

  return output;
}

/**
 * Generates a string representation of a directory tree starting from the given path.
 * @param dirPath - The path of the directory to generate the tree for.
 * @returns A Promise that resolves to a string representation of the directory tree.
 */
export async function directoryTree(dirPath: string): Promise<string> {
  return (await generateDirectoryTree(dirPath)).trim();
}
