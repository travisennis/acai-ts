import { tool } from "ai";
import { z } from "zod";
import { asyncExec } from "./command";

export function initTool() {
  return tool({
    description:
      "Executes the 'format' command on a specified file or directory and returns the result.",
    parameters: z.object({
      target: z.string().describe("The file or directory to format."),
    }),
    execute: ({ target }) => {
      const command = `biome format ${target}`;
      return asyncExec(command);
    },
  });
}
