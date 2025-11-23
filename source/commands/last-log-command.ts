import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.ts";
import { editor } from "../terminal/editor-prompt.ts";
import style from "../terminal/style.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Text } from "../tui/index.ts";
import { glob } from "../utils/glob.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

const isoDateRegex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/;

// Function to find the most recent log file
async function findMostRecentLog(logDir: string): Promise<string | null> {
  const logPattern = join(logDir, "*-repl-message.json");
  const files = await glob(logPattern);

  if (files.length === 0) {
    return null;
  }

  const datedFiles = files
    .map((file) => {
      const filename = file.split("/").pop();
      if (!filename) {
        return null; // Skip if filename is somehow undefined
      }
      // Match the ISO date string at the beginning of the filename
      const match = filename.match(isoDateRegex);
      if (match?.[1]) {
        const date = new Date(match[1]);
        if (!Number.isNaN(date.getTime())) {
          return { file, date };
        }
      }
      return null; // Exclude files that don't match the pattern or have invalid dates
    })
    .filter((item): item is { file: string; date: Date } => item !== null);

  if (datedFiles.length === 0) {
    return null; // No valid log files found
  }

  // Sort files by date (descending)
  datedFiles.sort((a, b) => b.date.getTime() - a.date.getTime());

  return datedFiles[0]?.file ?? null; // The first file is the most recent
}

export const lastLogCommand = ({ terminal }: CommandOptions): ReplCommand => {
  return {
    command: "/last-log",
    description: "Opens the most recent REPL audit log in the editor.",

    getSubCommands: () => Promise.resolve([]),
    execute: async (): Promise<"break" | "continue" | "use"> => {
      const logDir = config.app.ensurePathSync("audit");
      const mostRecentLog = await findMostRecentLog(logDir);

      if (!mostRecentLog) {
        terminal.error(`No REPL audit logs found in '${logDir}'.`);
        return "continue";
      }

      try {
        const content = await readFile(mostRecentLog, { encoding: "utf8" });

        // Use the editor prompt to display the content (read-only)
        await editor({
          message: `Viewing ${style.green(mostRecentLog)}`,
          postfix: ".json", // Set postfix for syntax highlighting if editor supports it
          default: content,
          // By not providing an onSubmit or similar handler to write the file,
          // and not calling writeFileSync after, this effectively becomes read-only.
          skipPrompt: true,
        });
        terminal.info("Closed log view");
        return "continue";
      } catch (error) {
        terminal.error(
          `Error reading or displaying log file ${mostRecentLog}: ${error}`,
        );
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
      const logDir = config.app.ensurePathSync("audit");
      const mostRecentLog = await findMostRecentLog(logDir);

      if (!mostRecentLog) {
        container.addChild(
          new Text(style.red(`No REPL audit logs found in '${logDir}'.`), 0, 1),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      try {
        const content = await readFile(mostRecentLog, { encoding: "utf8" });

        // For TUI mode, we'll just display a message since we can't use the editor prompt
        container.addChild(
          new Text(
            `Viewing most recent log: ${style.blue(mostRecentLog)}`,
            1,
            0,
          ),
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
        container.addChild(
          new Text(
            style.red(`Error reading log file ${mostRecentLog}: ${error}`),
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
};
