import fs from "node:fs/promises";
import path from "node:path"; // Import path module
import { globby } from "globby";
import { logger } from "../logger.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

const lineSplitRegex = /\r?\n/;

// Helper function to read and filter .gitignore
async function getFilteredIgnorePatterns(
  projectRoot: string,
): Promise<string[]> {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  let ignorePatterns: string[] = [];
  try {
    const gitignoreContent = await fs.readFile(gitignorePath, "utf-8");
    ignorePatterns = gitignoreContent
      .split(lineSplitRegex) // Split by lines
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")) // Remove empty lines and comments
      .filter((line) => line !== "*.backup"); // <<< Filter out the specific backup pattern
    // Add default git ignores that globby usually handles implicitly with gitignore:true
    ignorePatterns.push(".git");
  } catch (error) {
    // If .gitignore doesn't exist or can't be read, proceed without ignores
    // but log the error
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn(
        `Could not read .gitignore file: ${(error as Error).message}`,
      );
    }
    // Always ignore .git directory
    ignorePatterns = [".git"];
  }
  return ignorePatterns;
}

export function cleanRepoCommand(options: CommandOptions): ReplCommand {
  return {
    command: "/clean-repo",
    description: "Removes all .backup files created by agent edits.",
    aliases: ["/clean"],
    result: "continue",
    getSubCommands: () => Promise.resolve([]),
    execute: async (): Promise<void> => {
      const projectRoot = process.cwd();
      options.terminal.write("Starting cleanup of .backup files...\n");
      logger.info(`Starting cleanup in directory: ${projectRoot}`);
      let deletedCount = 0;

      try {
        // Get ignore patterns from .gitignore, excluding '*.backup'
        const ignorePatterns = await getFilteredIgnorePatterns(projectRoot);

        const backupFiles = await globby("**/*.backup", {
          cwd: projectRoot,
          gitignore: false, // <<< Disable automatic gitignore handling
          ignore: ignorePatterns, // <<< Provide the filtered list manually
          absolute: true,
          dot: true,
          onlyFiles: true,
        });

        if (backupFiles.length === 0) {
          options.terminal.info("No .backup files found.");
          logger.info("No .backup files found.");
          return;
        }

        for (const filePath of backupFiles) {
          try {
            await fs.unlink(filePath);
            logger.info(`Deleted backup file: ${filePath}`);
            deletedCount++;
          } catch (error) {
            logger.error(`Failed to delete backup file: ${filePath}`, error);
          }
        }

        const message = `Cleanup complete. Removed ${deletedCount} .backup file(s).\n`;
        options.terminal.write(message);
        logger.info(message);
      } catch (error) {
        const errorMessage = `Error during cleanup: ${(error as Error).message}`;
        options.terminal.error(errorMessage);
        logger.error(errorMessage, error);
      }
    },
  };
}
