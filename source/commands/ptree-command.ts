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
      terminal.display(await directoryTree(dirPath));
    },
  };
};
