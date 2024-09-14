import { asyncExec } from "./command";
import { tool } from "ai";
import { z } from "zod";
import { readProjectConfig } from "./config";
import logger from "./logger";

export function initTool() {
  return tool({
    description:
      "Executes the build command for the project and returns the output.",
    parameters: z.object({
      instructions: z
        .string()
        .describe("The instructions for the build command."),
    }),
    execute: async ({ instructions }) => {
      logger.info(instructions);
      const config = await readProjectConfig();
      const buildCommand = config.build || "npm run build";
      return asyncExec(buildCommand);
    },
  });
}
