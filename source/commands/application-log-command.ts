import { readFile } from "node:fs/promises";
import { editor } from "@inquirer/prompts";
import { config } from "../config.ts";
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
  };
};
