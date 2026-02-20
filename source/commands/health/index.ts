import type { Editor, TUI } from "../../tui/index.ts";
import {
  Container,
  Modal,
  ModalText,
  TableComponent,
} from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";
import {
  checkEnvironmentVariables,
  checkTools,
  formatEnvStatus,
  formatToolStatus,
} from "./utils.ts";

export function healthCommand(_options: CommandOptions): ReplCommand {
  return {
    command: "/health",
    description: "Show application health status and environment variables",

    getSubCommands: () => Promise.resolve([]),

    async handle(
      _args: string[],
      { tui, editor }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      const envStatus = checkEnvironmentVariables();
      const toolStatus = checkTools();

      const setCount = envStatus.filter((row) => row[1] === "✓ Set").length;
      const totalCount = envStatus.length;
      const installedCount = toolStatus.filter(
        (row) => row[1] === "✓ Installed",
      ).length;
      const totalTools = toolStatus.length;

      const usage = process.memoryUsage().rss;

      const modalContent = new Container();

      modalContent.addChild(
        new ModalText("Environment Variables Status:", 0, 1),
      );
      modalContent.addChild(
        new TableComponent(formatEnvStatus(envStatus), {
          headers: ["Variable", "Status", "Description"],
        }),
      );

      const envSummary = `Summary: ${setCount}/${totalCount} environment variables are set`;
      modalContent.addChild(new ModalText(envSummary, 0, 1));

      if (setCount === 0) {
        modalContent.addChild(
          new ModalText(
            "⚠️  No AI provider API keys are configured. The app may not function properly.",
            0,
            1,
          ),
        );
      } else {
        modalContent.addChild(
          new ModalText("✓ At least one AI provider is configured.", 0, 1),
        );
      }

      modalContent.addChild(new ModalText("", 0, 1));
      modalContent.addChild(new ModalText("Bash Tools Status:", 0, 1));
      modalContent.addChild(
        new TableComponent(formatToolStatus(toolStatus), {
          headers: ["Tool", "Status"],
        }),
      );

      const toolSummary = `Tool Summary: ${installedCount}/${totalTools} tools are installed.`;
      modalContent.addChild(new ModalText(toolSummary, 0, 1));

      if (installedCount < totalTools) {
        modalContent.addChild(
          new ModalText(
            "⚠️  Some tools are missing. Install them for full functionality.",
            0,
            1,
          ),
        );
      } else {
        modalContent.addChild(
          new ModalText("✓ All required tools are installed.", 0, 1),
        );
      }

      modalContent.addChild(new ModalText("", 0, 1));
      modalContent.addChild(new ModalText("Current Process:", 0, 1));

      const { formatMemoryUsage } = await import("../../utils/formatting.ts");
      const formattedUsage = formatMemoryUsage(usage);
      const memoryText = `Memory Usage: ${formattedUsage}`;
      modalContent.addChild(new ModalText(memoryText, 0, 1));

      const modal = new Modal("Health Status", modalContent, true, () => {
        editor.setText("");
        tui.requestRender();
      });

      tui.showModal(modal);
      return "continue";
    },
  };
}
