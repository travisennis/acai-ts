import type { CommandOptions, ReplCommand } from "./types.ts";

export const clearCommand = ({ terminal }: CommandOptions): ReplCommand => {
  return {
    command: "/clear",
    description: "Clears the terminal screen.",
    result: "continue" as const, // Keep the REPL running
    getSubCommands: () => Promise.resolve([]),
    execute: () => {
      terminal.clear();
      return Promise.resolve();
    },
  };
};
