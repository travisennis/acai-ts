import { directoryTree } from "../tools/filesystem.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const ptreeCommand = ({ terminal }: CommandOptions) => {
  return {
    command: "/ptree",
    description: "Displays the project tree.",
    result: "continue" as const,
    getSubCommands: () => [],
    execute: async () => {
      await terminal.display(await directoryTree(process.cwd()));
    },
  } satisfies ReplCommand;
};
