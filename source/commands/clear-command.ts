import type { CommandOptions, ReplCommand } from "./types.ts";

export const clearCommand = ({ terminal }: CommandOptions): ReplCommand => {
  return {
    command: "/clear",
    description: "Clears the terminal screen.",
    getSubCommands: () => Promise.resolve([]),
    execute: async () => {
      terminal.clear();
      return "continue";
    },
  };
};
