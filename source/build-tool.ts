import { tool } from "ai";
import { exec } from "node:child_process";
import { z } from "zod";

export function initTool() {
  return {
    build: tool({
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
      execute: async ({ command }) => {
        const buildCommand = command || "npm run build";
        return new Promise((resolve, reject) => {
          exec(buildCommand, (error, stdout, stderr) => {
            if (error) {
              reject(`Build execution error: ${error.message}`);
              return;
            }
            if (stderr) {
              console.error(`Build stderr: ${stderr}`);
            }
            resolve(stdout);
          });
        });
      },
    }),
  };
}
