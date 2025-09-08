import { initAgents, initTools } from "../tools/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export function listToolsCommand(options: CommandOptions): ReplCommand {
  return {
    command: "/list-tools",
    description: "List all available static and dynamic tools.",
    aliases: ["/lt"],
    result: "continue",
    getSubCommands: async () => [],
    async execute(_args: string[]) {
      const { terminal } = options;

      try {
        const tools = await initTools({
          terminal: options.terminal,
          tokenCounter: options.tokenCounter,
          events: new Map(),
          autoAcceptAll: false,
        });
        const agentTools = await initAgents({
          terminal: options.terminal,
          modelManager: options.modelManager,
          tokenTracker: options.tokenTracker,
          tokenCounter: options.tokenCounter,
          events: new Map(),
        });
        const toolNames = Object.keys({ ...tools, ...agentTools }).sort();

        terminal.writeln("Available tools:");
        terminal.lineBreak();

        // Separate static and dynamic tools
        const staticTools = [];
        const dynamicTools = [];

        for (const toolName of toolNames) {
          if (toolName.startsWith("dynamic:")) {
            dynamicTools.push(toolName);
          } else {
            staticTools.push(toolName);
          }
        }

        // Display static tools
        if (staticTools.length > 0) {
          terminal.writeln("  Static tools:");
          for (const toolName of staticTools) {
            terminal.writeln(`    ${toolName}`);
          }
        }

        // Display dynamic tools
        if (dynamicTools.length > 0) {
          terminal.writeln("  Dynamic tools:");
          for (const toolName of dynamicTools) {
            terminal.writeln(`    ${toolName}`);
          }
        }

        // Display summary
        terminal.writeln(
          `\n  Total: ${staticTools.length} static, ${dynamicTools.length} dynamic`,
        );
      } catch (error) {
        terminal.error(`Error listing tools: ${(error as Error).message}`);
      }
    },
  };
}
