import { tool } from "ai";
import { exec } from "node:child_process";
import { z } from "zod";

export function initTool() {
  return {
    format: tool({
      description:
        "Executes the 'format' command on a specified file or directory and returns the result.",
      parameters: z.object({
        target: z.string().describe("The file or directory to format."),
      }),
      execute: async ({ target }) => {
        const command = `biome format ${target}`;

        return new Promise((resolve, reject) => {
          exec(command, (error, stdout, stderr) => {
            if (error) {
              reject(`Format execution error: ${error.message}`);
              return;
            }
            if (stderr) {
              console.error(`Format stderr: ${stderr}`);
            }
            resolve(stdout);
          });
        });
      },
    }),
  };
}
