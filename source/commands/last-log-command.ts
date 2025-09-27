import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { editor } from "@inquirer/prompts";
import { globby } from "globby";
import { config } from "../config.ts";
import style from "../terminal/style.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

const isoDateRegex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/;

// Function to find the most recent log file
async function findMostRecentLog(logDir: string): Promise<string | null> {
  const logPattern = join(logDir, "*-repl-message.json");
  const files = await globby(logPattern);

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
        try {
          const date = new Date(match[1]);
          // Check if the date is valid
          if (!Number.isNaN(date.getTime())) {
            return { file, date };
          }
        } catch (e) {
          // Ignore files with invalid date strings
          console.warn(`Could not parse date from filename: ${filename}`, e);
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
    result: "continue" as const,
    getSubCommands: () => Promise.resolve([]),
    execute: async () => {
      const logDir = config.app.ensurePathSync("audit");
      const mostRecentLog = await findMostRecentLog(logDir);

      if (!mostRecentLog) {
        terminal.error(`No REPL audit logs found in '${logDir}'.`);
        return;
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
        });
        terminal.info("Closed log view");
      } catch (error) {
        terminal.error(
          `Error reading or displaying log file ${mostRecentLog}: ${error}`,
        );
      }
    },
  };
};
