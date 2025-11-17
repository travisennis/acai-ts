import style from "../terminal/style.ts";
import { initAgents, initTools } from "../tools/index.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Text } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export function listToolsCommand(options: CommandOptions): ReplCommand {
  return {
    command: "/list-tools",
    description: "List all available static and dynamic tools.",
    aliases: ["/lt"],

    getSubCommands: async () => [],
    async execute(_args: string[]): Promise<"break" | "continue" | "use"> {
      const { terminal } = options;

      try {
        const tools = await initTools({
          tokenCounter: options.tokenCounter,
          workspace: options.workspace,
          modelManager: options.modelManager,
          tokenTracker: options.tokenTracker,
        });
        const agentTools = await initAgents({
          terminal: options.terminal,
          modelManager: options.modelManager,
          tokenTracker: options.tokenTracker,
          tokenCounter: options.tokenCounter,
          workspace: options.workspace,
        });
        const toolNames = Object.keys({ ...tools, ...agentTools }).sort();

        terminal.writeln("Available tools:");
        terminal.lineBreak();

        // Separate static and dynamic tools
        const staticTools = [];
        const dynamicTools = [];

        for (const toolName of toolNames) {
          if (toolName.startsWith("dynamic-")) {
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
        return "continue";
      } catch (error) {
        terminal.error(`Error listing tools: ${(error as Error).message}`);
        return "continue";
      }
    },
    async handle(
      _args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      try {
        const tools = await initTools({
          tokenCounter: options.tokenCounter,
          workspace: options.workspace,
          modelManager: options.modelManager,
          tokenTracker: options.tokenTracker,
        });
        const agentTools = await initAgents({
          terminal: options.terminal,
          modelManager: options.modelManager,
          tokenTracker: options.tokenTracker,
          tokenCounter: options.tokenCounter,
          workspace: options.workspace,
        });
        const toolNames = Object.keys({ ...tools, ...agentTools }).sort();

        container.addChild(new Text("Available tools:", 1, 0));

        // Separate static and dynamic tools
        const staticTools = [];
        const dynamicTools = [];

        for (const toolName of toolNames) {
          if (toolName.startsWith("dynamic-")) {
            dynamicTools.push(toolName);
          } else {
            staticTools.push(toolName);
          }
        }

        let lineIndex = 2;

        // Display static tools
        if (staticTools.length > 0) {
          container.addChild(new Text("  Static tools:", lineIndex, 0));
          lineIndex++;
          for (const toolName of staticTools) {
            container.addChild(new Text(`    ${toolName}`, lineIndex, 0));
            lineIndex++;
          }
        }

        // Display dynamic tools
        if (dynamicTools.length > 0) {
          container.addChild(new Text("  Dynamic tools:", lineIndex, 0));
          lineIndex++;
          for (const toolName of dynamicTools) {
            container.addChild(new Text(`    ${toolName}`, lineIndex, 0));
            lineIndex++;
          }
        }

        // Display summary
        container.addChild(
          new Text(
            `\n  Total: ${staticTools.length} static, ${dynamicTools.length} dynamic`,
            lineIndex,
            0,
          ),
        );

        tui.requestRender();
        editor.setText("");
        return "continue";
      } catch (error) {
        container.addChild(
          new Text(
            style.red(`Error listing tools: ${(error as Error).message}`),
            1,
            0,
          ),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }
    },
  };
}
