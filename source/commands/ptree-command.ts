import { directoryTree } from "../tools/filesystem-utils.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const ptreeCommand = ({ terminal }: CommandOptions): ReplCommand => {
  return {
    command: "/ptree",
    description: "Displays the project tree.",
    result: "continue" as const,
    getSubCommands: () => Promise.resolve([]),
    execute: async () => {
      terminal.display(await directoryTree(process.cwd()));
    },
  };
};
