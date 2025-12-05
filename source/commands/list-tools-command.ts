import style from "../terminal/style.ts";
import { initAgents, initTools } from "../tools/index.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Spacer, Text } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export function listToolsCommand(options: CommandOptions): ReplCommand {
  return {
    command: "/list-tools",
    description: "List all available static and dynamic tools.",
    aliases: ["/lt"],

    getSubCommands: async () => [],
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
          modelManager: options.modelManager,
          tokenTracker: options.tokenTracker,
          tokenCounter: options.tokenCounter,
          workspace: options.workspace,
        });
        const toolNames = Object.keys({
          ...tools.toolDefs,
          ...agentTools.toolDefs,
        }).sort();

        container.addChild(new Text("Available tools:", 0, 1));

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
          container.addChild(new Text("Static tools:", 1, 0));
          for (const toolName of staticTools) {
            container.addChild(new Text(`${toolName}`, 2, 0));
          }
        }

        // Display dynamic tools
        if (dynamicTools.length > 0) {
          container.addChild(new Spacer(1));
          container.addChild(new Text("Dynamic tools:", 1, 0));
          for (const toolName of dynamicTools) {
            container.addChild(new Text(`${toolName}`, 2, 0));
          }
        }

        // Display summary
        container.addChild(new Spacer(1));
        container.addChild(
          new Text(
            `Total: ${staticTools.length} static, ${dynamicTools.length} dynamic`,
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
