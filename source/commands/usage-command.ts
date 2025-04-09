import type { CommandOptions, ReplCommand } from "./types.ts";

export function usageCommand({
  terminal,
  tokenTracker,
}: CommandOptions): ReplCommand {
  return {
    command: "/usage",
    description: "Show token usage breakdown",
    result: "continue",
    getSubCommands: () => [],
    async execute() {
      terminal.table(Object.entries(tokenTracker.getUsageBreakdown()), {
        header: ["App", "Tokens"],
        border: "single",
      });
    },
  };
}
