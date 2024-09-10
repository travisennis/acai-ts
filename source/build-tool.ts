import { asyncExec } from "./command";
import { tool } from "ai";
import { z } from "zod";

export function initTool() {
  return tool({
    description:
      "Executes the build command for the project and returns the output.",
    parameters: z.object({
      command: z
        .string()
        .describe(
          "Optional custom build command. If not provided, the default build command will be used.",
        )
        .optional(),
    }),
    execute: ({ command }) => {
      const buildCommand = command || "npm run build";
      return asyncExec(buildCommand);
    },
  });
}
