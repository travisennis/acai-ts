import { tool } from "ai";
import child_process from "node:child_process";
import { z } from "zod";

export function initTool() {
  return {
    lint: tool({
      description:
        "Lints the provided code base using a specified command and returns the results. This function helps identify and report potential issues, style violations, or errors in the code, improving code quality and consistency.",
      parameters: z.object({
        fileName: z.string().describe("The path of the file to lint."),
      }),
      execute: async ({ fileName }) => {
        const file = fileName;
        const executeCommand = (file: string): Promise<string> => {
          return new Promise((resolve, reject) => {
            child_process.exec(`biome check ${file}`, (error, stdout) => {
              if (error) {
                reject(error);
              } else {
                resolve(stdout.toString());
              }
            });
          });
        };

        const result = await executeCommand(file);
        console.log(file, result);
        return result;
      },
    }),
  };
}
