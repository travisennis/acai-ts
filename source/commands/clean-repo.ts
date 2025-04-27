import fs from "node:fs/promises";
import { globby } from "globby";
import { logger } from "../logger.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export function cleanRepoCommand(options: CommandOptions): ReplCommand {
  return {
    command: "/clean-repo",
    description: "Removes all .backup files created by agent edits.",
    aliases: ["/clean"],
    result: "continue",
    getSubCommands: () => [],
    execute: async (): Promise<void> => {
      const projectRoot = process.cwd();
      options.terminal.write("Starting cleanup of .backup files...\n");
      logger.info(`Starting cleanup in directory: ${projectRoot}`);
      let deletedCount = 0;

      try {
        // Use gitignore: true to respect .gitignore rules
        const backupFiles = await globby("**/*.backup", {
          cwd: projectRoot,
          gitignore: true, // Respect .gitignore
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
