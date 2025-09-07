import { loadDynamicTools } from "../tools/dynamic-tool-loader.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export function reloadToolsCommand(options: CommandOptions): ReplCommand {
  return {
    command: "/reload-tools",
    description:
      "Rescan and list dynamic tools (full reload requires app restart).",
    aliases: ["/rt"],
    result: "continue",
    getSubCommands: async () => [],
    async execute(_args: string[]) {
      const { terminal } = options;
      terminal.writeln("Rescanning dynamic tools...");

      try {
        const dynamicToolsObj = await loadDynamicTools({
          baseDir: process.cwd(),
          sendData: undefined,
        });
        const dynamicToolNames = Object.keys(dynamicToolsObj).sort();

        terminal.writeln("Dynamic tools found:");
        for (const toolName of dynamicToolNames) {
          terminal.writeln(`  ${toolName}`);
        }

        if (dynamicToolNames.length === 0) {
          terminal.writeln("  No dynamic tools found.");
        }

        terminal.writeln(
          "\nNote: For full integration, restart the application.",
        );
      } catch (error) {
        terminal.error(`Error rescanning tools: ${(error as Error).message}`);
      }
    },
  };
}
