import Table from "cli-table3";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const helpCommand = (_options: CommandOptions) => {
  return {
    command: "/help",
    description: "Shows usage table.",
    result: "continue" as const,
    getSubCommands: () => [],
    execute: (args?: string[] | Map<string, ReplCommand>) => {
      // If first argument is a Map, it's the commands collection
      const commands =
        args instanceof Map ? args : new Map<string, ReplCommand>();

      const table = new Table({
        head: ["command", "description"],
      });

      table.push(
        ...Array.from(commands.values())
          .sort((a, b) => (a.command > b.command ? 1 : -1))
          .map((cmd) => [cmd.command, cmd.description]),
      );

      console.info(table.toString());
      return Promise.resolve();
    },
  } satisfies ReplCommand;
};
