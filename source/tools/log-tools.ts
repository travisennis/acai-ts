import { execSync } from "node:child_process";
import { tool } from "ai";
import { z } from "zod";
import type { SendData } from "./types.ts";

export const createLogTools = (options: {
  sendData?: SendData | undefined;
  logPath: string | undefined;
}) => {
  const { sendData, logPath } = options;

  return {
    searchLogs: tool({
      description:
        "Search the application log file for patterns. Prioritizes recent entries.",
      parameters: z.object({
        pattern: z.string().describe("The regex pattern to search for"),
        maxResults: z
          .number()
          .nullable()
          .describe(
            "Maximum number of matching lines to return (from the end of the file). Pass null to use the default (100).",
          ),
        ignoreCase: z
          .boolean()
          .nullable()
          .describe(
            "Whether to ignore case. Pass null to use the default (false).",
          ),
        contextLines: z
          .number()
          .nullable()
          .describe(
            "Number of lines of context to show around each match. Pass null for no context.",
          ),
      }),
      execute: ({ pattern, maxResults, ignoreCase, contextLines }) => {
        // Handle nullable parameters with defaults
        const effectiveMaxResults = maxResults === null ? 100 : maxResults;
        const effectiveIgnoreCase = ignoreCase === null ? false : ignoreCase;
        const effectiveContextLines = contextLines; // null means no context lines
        const uuid = crypto.randomUUID();
        try {
          sendData?.({
            event: "tool-init",
            id: uuid,
            data: `Searching logs for "${pattern}"`,
          });

          if (!logPath) {
            // If logPath wasn't provided during creation, skip the tool execution
            const errorMsg =
              "Log tool not configured: Log file path is missing.";
            sendData?.({ event: "tool-error", id: uuid, data: errorMsg });
            return Promise.resolve(errorMsg);
          }

          // Build the ripgrep command
          let command = "rg --no-config --no-ignore --line-number"; // Ignore user/project rg config and ignore files

          if (effectiveIgnoreCase) {
            command += " --ignore-case";
          }

          if (effectiveContextLines !== null) {
            command += ` --context=${effectiveContextLines}`;
          }

          // Add pattern (escaped for shell)
          command += ` ${JSON.stringify(pattern)}`;

          // Add the specific log file path
          command += ` ${JSON.stringify(logPath)}`;

          // Pipe to tail to get the last N lines
          command += ` | tail -n ${effectiveMaxResults}`;

          // Execute the command
          const result = execSync(command, { encoding: "utf-8" });

          const output = result.trim() || "No matches found.";

          sendData?.({
            event: "tool-completion",
            id: uuid,
            data: `Log search complete. Results:\n${output}`,
          });
          return Promise.resolve(output);
        } catch (error: any) {
          // Check if the error is due to 'tail' finding nothing from 'rg' (which exits with 0 if it finds something, 1 if not)
          // or if rg itself failed (non-zero exit code other than 1)
          // or if tail failed for some reason.
          // If rg finds nothing (exit code 1), execSync throws but tail might still run.
          // If rg finds something but tail gets empty input, tail might exit non-zero.
          // If rg fails for other reasons (e.g., file not found), it exits non-zero.

          // Simplified handling: If rg exits with 1 (no matches), execSync throws.
          // We catch it and check the status code if available.
          if (
            error.status === 1 &&
            error.stderr?.includes("No such file or directory")
          ) {
            // This handles the case where the log file itself doesn't exist
            const errorMessage = `Error: Log file not found at ${error.cmd?.split(" ").pop()}`;
            sendData?.({ event: "tool-error", id: uuid, data: errorMessage });
            return Promise.resolve(errorMessage);
          }

          if (error.status === 1) {
            // rg exited with 1, meaning no matches found. Tail likely received no input.
            const noMatchMessage = "No matches found.";
            sendData?.({
              event: "tool-completion",
              id: uuid,
              data: noMatchMessage,
            }); // Still a completion, just no results
            return Promise.resolve(noMatchMessage);
          }

          // Handle other errors (rg errors other than no match, tail errors, etc.)
          const errorMessage = `Error executing log search: ${(error as Error).message}`;
          sendData?.({ event: "tool-error", id: uuid, data: errorMessage });
          return Promise.resolve(errorMessage);
        }
      },
    }),
  };
};
