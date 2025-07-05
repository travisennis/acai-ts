import fs from "node:fs/promises";
import path from "node:path";
import { globby } from "globby";
import { directoryTree } from "../tools/filesystem-utils.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const ptreeCommand = ({ terminal }: CommandOptions): ReplCommand => {
  return {
    command: "/ptree",
    description: "Displays the project tree for a given path.",
    result: "continue" as const,
    getSubCommands: async () => {
      const directories = await globby("**/*", {
        onlyDirectories: true,
        gitignore: true,
      });
      return directories;
    },
    execute: async (args) => {
      const targetPath = args.join(" ").trim();
      const dirPath = targetPath
        ? path.resolve(process.cwd(), targetPath)
        : process.cwd();

      try {
        const stats = await fs.stat(dirPath);
        if (!stats.isDirectory()) {
          terminal.error(
            `Error: '${targetPath || dirPath}' is not a directory.`,
          );
          return;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          terminal.error(
            `Error: Directory not found at '${targetPath || dirPath}'`,
          );
          return;
        }
        throw error;
      }
      terminal.display(await directoryTree(dirPath));
    },
  };
};
