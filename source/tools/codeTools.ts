import { isUndefined } from "@travisennis/stdlib/typeguards";
import { tool } from "ai";
import { z } from "zod";
import { executeCommand } from "../utils/process.ts";
import type { SendData } from "./types.ts";

export interface Config {
  build?: string | undefined;
  lint?: string | undefined;
  format?: string | undefined;
  test?: string | undefined;
  install?: string | undefined;
}

export const createCodeTools = ({
  baseDir,
  config,
  sendData,
}: {
  baseDir: string;
  config?: Config | undefined;
  sendData?: SendData | undefined;
}) => {
  return {
    installDependencies: tool({
      description:
        "Installs dependencies in the project. Accepts an array of package names (e.g., ['lodash', '@types/node']) with optional version specifiers (e.g., 'lodash@4.17.21', 'react@latest'). Defaults to 'npm install' but can be configured via project config. Use the dev parameter to install as development dependencies.",
      parameters: z.object({
        dependencies: z
          .array(z.string())
          .describe(
            "Array of package names to install (e.g., ['express', 'lodash@4.17.21'])",
          ),
        dev: z
          .boolean()
          .optional()
          .describe("Whether to install as dev dependencies (--save-dev)"),
      }),
      execute: async ({ dependencies, dev }) => {
        if (!dependencies || dependencies.length === 0) {
          return "No dependencies specified";
        }

        const installCommand = config?.install || "npm install";
        const devFlag = dev ? " --save-dev" : "";
        const fullCommand = `${installCommand}${devFlag} ${dependencies.join(" ")}`;

        sendData?.({
          event: "tool-init",
          data: `Installing dependencies in ${baseDir}: ${dependencies.join(", ")}`,
        });

        try {
          const result = format(await asyncExec(fullCommand, baseDir));
          sendData?.({
            event: "tool-completion",
            data: `Successfully installed ${dev ? "dev dependencies" : "dependencies"}: ${dependencies.join(", ")}`,
          });

          return result;
        } catch (error) {
          sendData?.({
            event: "tool-error",
            data: `Error installing dependencies in ${baseDir}: ${(error as Error).message}`,
          });
          return `Failed to install dependencies: ${(error as Error).message}`;
        }
      },
    }),
    buildCode: tool({
      description:
        "Executes the build command for the current code base and returns the output.",
      parameters: z.object({}),
      execute: async () => {
        const buildCommand = config?.build || "npm run build";
        sendData?.({
          event: "tool-init",
          data: `Building code in ${baseDir}`,
        });
        try {
          const result = format(await asyncExec(buildCommand, baseDir));
          sendData?.({
            event: "tool-completion",
            data: "Build complete.",
          });

          return result;
        } catch (error) {
          sendData?.({
            event: "tool-error",
            data: `Error building code in ${baseDir}: ${(error as Error).message}`,
          });
          return `Failed to execute build command: ${(error as Error).message}`;
        }
      },
    }),
    lintCode: tool({
      description:
        "Lints the current code base and returns the results. This tool helps identify and report potential issues, style violations, or errors in the code, improving code quality and consistency.",
      parameters: z.object({}),
      execute: async () => {
        if (sendData) {
          sendData({
            event: "tool-init",
            data: `Linting code in ${baseDir}`,
          });
        }
        const lintCommand = config?.lint || "npm run lint";
        try {
          const result = format(await asyncExec(lintCommand, baseDir));
          sendData?.({
            event: "tool-completion",
            data: "Lint complete.",
          });

          return result;
        } catch (error) {
          sendData?.({
            event: "tool-error",
            data: `Error linting code in ${baseDir}: ${(error as Error).message}`,
          });
          return `Failed to execute lint command: ${(error as Error).message}`;
        }
      },
    }),
    formatCode: tool({
      description:
        "Executes the 'format' command on the current code base and returns the results. This reports style and formatting issues with the code base.",
      parameters: z.object({}),
      execute: async () => {
        if (sendData) {
          sendData({
            event: "tool-init",
            data: `Formatting code in ${baseDir}`,
          });
        }
        const formatCommand = config?.format || "npm run format";
        try {
          const result = format(await asyncExec(formatCommand, baseDir));
          sendData?.({
            event: "tool-completion",
            data: "Format complete.",
          });

          return result;
        } catch (error) {
          sendData?.({
            event: "tool-error",
            data: `Error formatting code in ${baseDir}: ${(error as Error).message}`,
          });
          return `Failed to execute format command: ${(error as Error).message}`;
        }
      },
    }),
    testCode: tool({
      description:
        "Executes the 'test' command on the current code base to run unit tests and return the results.",
      parameters: z.object({}),
      execute: async () => {
        if (sendData) {
          sendData({
            event: "tool-init",
            data: `Running unit tests in ${baseDir}`,
          });
        }
        const testCommand = config?.test || "npm run test";
        try {
          const result = format(await asyncExec(testCommand, baseDir));
          sendData?.({
            event: "tool-completion",
            data: "Format complete.",
          });

          return result;
        } catch (error) {
          sendData?.({
            event: "tool-error",
            data: `Error testing code in ${baseDir}: ${(error as Error).message}`,
          });
          return `Failed to execute test command: ${(error as Error).message}`;
        }
      },
    }),
  };
};

function format({
  stdout,
  stderr,
}: { stdout: string; stderr: string; code: number }) {
  return `${stdout}\n${stderr}`;
}

function asyncExec(
  command: string,
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const [cmd, ...args] = command.split(" ");
    if (isUndefined(cmd)) {
      return Promise.resolve({
        stdout: "",
        stderr: "Missing command",
        code: 1,
      });
    }

    return executeCommand([cmd, ...args], {
      cwd,
      timeout: 10 * 60 * 1000,
      shell: true,
      throwOnError: false,
    });
  } catch (error) {
    console.error(error);
    return Promise.resolve({ stdout: "", stderr: "", code: 1 });
  }
}
