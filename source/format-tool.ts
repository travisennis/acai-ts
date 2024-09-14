import { tool } from "ai";
import { z } from "zod";
import { asyncExec } from "./command";
import { readProjectConfig } from "./config";

export function initTool() {
  return tool({
    description:
      "Executes the 'format' command on a specified file or directory and returns the result.",
    parameters: z.object({
      target: z.string().describe("The file or directory to format."),
    }),
    execute: async ({ target }) => {
      const config = await readProjectConfig();
      const formatCommand = config.format || `biome format ${target}`;
      return asyncExec(formatCommand);
    },
  });
}
