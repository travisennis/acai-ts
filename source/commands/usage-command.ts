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
    execute() {
      const entries = Object.entries(tokenTracker.getUsageBreakdown());
      if (entries.length === 0) {
        terminal.info("No usage yet.");
      } else {
        terminal.table(entries, {
          header: ["App", "Tokens"],
        });
      }
      terminal.lineBreak();
      return Promise.resolve();
    },
  };
}
