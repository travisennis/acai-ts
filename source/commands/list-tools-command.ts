import style from "../terminal/style.ts";
import { initAgents, initTools } from "../tools/index.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import {
  Modal,
  Container as ModalContainer,
  ModalText,
  TableComponent,
} from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export function listToolsCommand(options: CommandOptions): ReplCommand {
  return {
    command: "/list-tools",
    description: "List all available static and dynamic tools.",
    aliases: ["/lt"],

    getSubCommands: async () => [],
    async handle(
      _args: string[],
      { tui, editor }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      try {
        // Get active tools from config
        const projectConfig = await options.config.readProjectConfig();
        const activeTools = projectConfig.tools.activeTools;

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

        // Build modal content
        const modalContent = new ModalContainer();

        if (toolNames.length === 0) {
          modalContent.addChild(new ModalText("No tools available.", 0, 1));
        } else {
          // Create table data
          const tableData = [];

          // Add static tools
          for (const toolName of staticTools) {
            const isActive = activeTools.includes(toolName);
            tableData.push([
              toolName,
              "Static",
              isActive ? "Active" : "Inactive",
            ]);
          }

          // Add dynamic tools
          for (const toolName of dynamicTools) {
            const isActive = activeTools.includes(toolName);
            tableData.push([
              toolName,
              "Dynamic",
              isActive ? "Active" : "Inactive",
            ]);
          }

          modalContent.addChild(
            new TableComponent(tableData, {
              headers: ["Tool Name", "Type", "Status"],
              colWidths: [60, 20, 20],
            }),
          );

          // Add summary
          modalContent.addChild(new ModalText("", 0, 1)); // Spacer
          const activeCount = toolNames.filter((tool) =>
            activeTools.includes(tool),
          ).length;
          modalContent.addChild(
            new ModalText(
              `Total: ${staticTools.length} static, ${dynamicTools.length} dynamic, ${activeCount} active`,
              0,
              1,
            ),
          );
        }

        // Create and show modal
        const modal = new Modal("Available Tools", modalContent, true, () => {
          // Modal closed callback
          editor.setText("");
          tui.requestRender();
        });

        tui.showModal(modal);
        return "continue";
      } catch (error) {
        // Show error in modal
        const errorContent = new ModalContainer();
        errorContent.addChild(
          new ModalText(
            style.red(`Error listing tools: ${(error as Error).message}`),
            0,
            1,
          ),
        );

        const errorModal = new Modal("Error", errorContent, true, () => {
          editor.setText("");
          tui.requestRender();
        });

        tui.showModal(errorModal);
        return "continue";
      }
    },
  };
}
