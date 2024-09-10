import { tool } from "ai";
import { z } from "zod";
import { asyncExec } from "./command";

export function initTool() {
  return tool({
    description:
      "Lints the provided code base using a specified command and returns the results. This function helps identify and report potential issues, style violations, or errors in the code, improving code quality and consistency.",
    parameters: z.object({
      fileName: z.string().describe("The path of the file to lint."),
    }),
    execute: ({ fileName }) => {
      const file = fileName;
      const command = `biome check ${file}`;
      return asyncExec(command);
    },
  });
}
