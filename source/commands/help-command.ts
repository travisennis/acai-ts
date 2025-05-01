import type { CommandOptions, ReplCommand } from "./types.ts";

export const helpCommand = (
  { terminal }: CommandOptions,
  cmds: Map<string, ReplCommand>,
): ReplCommand => {
  return {
    command: "/help",
    description: "Shows available commands.",
    result: "continue" as const,
    getSubCommands: () => Promise.resolve([]),
    execute: () => {
      const commands = cmds;

      const entries: [string, string][] = Array.from(commands.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, cmd]) => [key, cmd.description]);

      terminal.table(entries, {
        header: ["Command", "Description"],
      });

      return Promise.resolve();
    },
  };
};
