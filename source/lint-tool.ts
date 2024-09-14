import { tool } from "ai";
import { z } from "zod";
import { asyncExec } from "./command";
import { readProjectConfig } from "./config";

export function initTool() {
  return tool({
    description:
      "Lints the provided code base using a specified command and returns the results. This function helps identify and report potential issues, style violations, or errors in the code, improving code quality and consistency.",
    parameters: z.object({
      fileName: z.string().describe("The path of the file to lint."),
    }),
    execute: async ({ fileName }) => {
      const file = fileName;
      const config = await readProjectConfig();
      const lintCommand = config.lint || `biome check ${file}`;
      return asyncExec(lintCommand);
    },
  });
}
