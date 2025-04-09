import type { CommandOptions, ReplCommand } from "./types.ts";

export const helpCommand = ({ terminal }: CommandOptions) => {
  return {
    command: "/help",
    description: "Shows available commands.",
    result: "continue" as const,
    getSubCommands: () => [],
    execute: (args?: string[] | Map<string, ReplCommand>) => {
      // If first argument is a Map, it's the commands collection
      const commands =
        args instanceof Map ? args : new Map<string, ReplCommand>();

      const entries: [string, string][] = Array.from(commands.values())
        .sort((a, b) => (a.command > b.command ? 1 : -1))
        .map((cmd) => [cmd.command, cmd.description]);

      terminal.table(entries, {
        header: ["Command", "Description"],
      });

      terminal.lineBreak();

      return Promise.resolve();
    },
  } satisfies ReplCommand;
};
