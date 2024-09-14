import { asyncExec } from "./command";
import { tool } from "ai";
import { z } from "zod";

export function initTool() {
  return tool({
    description:
      "Executes the build command for the project and returns the output.",
    parameters: z.object({
      instructions: z
        .string()
        .describe("The instructions for the build command."),
    }),
    execute: ({ instructions }) => {
      console.log(instructions);
      const buildCommand = "npm run build";
      return asyncExec(buildCommand);
    },
  });
}
