import type { CommandOptions, ReplCommand } from "./types.ts";
import { directoryTree } from "../tools/filesystem.ts";

export const ptreeCommand = ({ terminal }: CommandOptions) => {
  return {
    command: "/ptree",
    description: "Displays the project tree.",
    result: "continue" as const,
    execute: async () => {
      terminal.display(await directoryTree(process.cwd()));
    },
  } satisfies ReplCommand;
};
