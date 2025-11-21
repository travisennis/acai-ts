import { readFile } from "node:fs/promises";
import { config } from "../config.ts";
import { editor } from "../terminal/editor-prompt.ts";
import style from "../terminal/style.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Text } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export const applicationLogCommand = ({
  terminal,
}: CommandOptions): ReplCommand => {
  return {
    command: "/application-logs",
    description:
      "Opens the application log file defined in acai.json in the editor.",

    getSubCommands: () => Promise.resolve([]),
    execute: async (): Promise<"break" | "continue" | "use"> => {
      let logFilePath: string | undefined;
      try {
        const projectConfig = await config.readProjectConfig();
        logFilePath = projectConfig.logs?.path;

        if (!logFilePath) {
          terminal.error(
            "Application log path is not defined in .acai/acai.json under the 'logs.path' key.",
          );
          return "continue";
        }

        const content = await readFile(logFilePath, { encoding: "utf8" });

        // Use the editor prompt to display the content (read-only)
        await editor({
          message: `Viewing ${logFilePath}`,
          // Attempt to infer postfix from file extension, default otherwise
          postfix: logFilePath.includes(".")
            ? `.${logFilePath.split(".").pop()}`
            : ".log",
          default: content,
          // By not providing an onSubmit or similar handler to write the file,
          // and not calling writeFileSync after, this effectively becomes read-only.
          skipPrompt: true,
        });
        terminal.info(`Closed log view for: ${logFilePath}`);
        return "continue";
      } catch (error) {
        if (logFilePath && (error as NodeJS.ErrnoException).code === "ENOENT") {
          terminal.error(`Application log file not found at: ${logFilePath}`);
        } else {
          terminal.error(
            `Error reading or displaying log file ${logFilePath ?? "specified in config"}: ${error}`,
          );
        }
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
      let logFilePath: string | undefined;
      try {
        const projectConfig = await config.readProjectConfig();
        logFilePath = projectConfig.logs?.path;

        if (!logFilePath) {
          container.addChild(
            new Text(
              style.red(
                "Application log path is not defined in .acai/acai.json under the 'logs.path' key.",
              ),
              1,
              0,
            ),
          );
          tui.requestRender();
          editor.setText("");
          return "continue";
        }

        const content = await readFile(logFilePath, { encoding: "utf8" });

        // For TUI mode, we'll just display a message since we can't use the editor prompt
        container.addChild(
          new Text(`Viewing application log: ${style.blue(logFilePath)}`, 0, 1),
        );
        container.addChild(
          new Text(`Content length: ${content.length} characters`, 2, 0),
        );
        container.addChild(
          new Text(
            style.dim("Note: Full log viewing not available in TUI mode"),
            3,
            0,
          ),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      } catch (error) {
        if (logFilePath && (error as NodeJS.ErrnoException).code === "ENOENT") {
          container.addChild(
            new Text(
              style.red(`Application log file not found at: ${logFilePath}`),
              1,
              0,
            ),
          );
        } else {
          container.addChild(
            new Text(
              style.red(
                `Error reading log file ${logFilePath ?? "specified in config"}: ${error}`,
              ),
              1,
              0,
            ),
          );
        }
        tui.requestRender();
        editor.setText("");
        return "continue";
      }
    },
  };
};
