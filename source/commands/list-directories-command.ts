import type { CommandOptions, ReplCommand } from "./types.ts";

export const listDirectoriesCommand = ({
  terminal,
  workspace,
}: CommandOptions): ReplCommand => {
  return {
    command: "/list-directories",
    description: "List all allowed working directories",
    getSubCommands: async (): Promise<string[]> => {
      return [];
    },
    execute: async () => {
      terminal.header("Current working directories:");

      workspace.allowedDirs.forEach((dir) => {
        const isPrimary = dir === workspace.primaryDir;
        const prefix = isPrimary ? "● " : "  ";
        const indicator = isPrimary ? " (primary)" : "";
        terminal.writeln(`${prefix}${dir}${indicator}`);
      });

      if (workspace.allowedDirs.length === 0) {
        terminal.warn(
          "No directories configured. Using current directory only.",
        );
      }

      return "continue";
    },
  };
};
