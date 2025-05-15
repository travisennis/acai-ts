import type { CommandOptions, ReplCommand } from "./types.ts";

export function usageCommand({
  terminal,
  tokenTracker,
}: CommandOptions): ReplCommand {
  return {
    command: "/usage",
    description: "Show token usage breakdown",
    result: "continue",
    getSubCommands: () => Promise.resolve([]),
    execute() {
      const entries = Object.entries(tokenTracker.getUsageBreakdown());
      if (entries.length === 0) {
        terminal.info("No usage yet.");
      } else {
        terminal.table(entries, {
          header: ["App", "Tokens"],
          colWidths: [30, 70],
        });
      }

      return Promise.resolve();
    },
  };
}
