import { execFile } from "node:child_process";
import { tool } from "ai";
import { z } from "zod";
import type { SendData } from "./types.ts";

export interface Config {
  build?: string | undefined;
  lint?: string | undefined;
  format?: string | undefined;
  test?: string | undefined;
}

export const createCodeTools = ({
  baseDir,
  config,
  sendData,
}: { baseDir: string; config?: Config; sendData?: SendData }) => {
  return {
    buildCode: tool({
      description:
        "Executes the build command for the current code base and returns the output.",
      parameters: z.object({}),
      execute: async () => {
        const buildCommand = config?.build || "npm run build";
        if (sendData) {
          sendData({
            event: "tool-init",
            data: `Building code in ${baseDir}`,
          });
        }
        try {
          return format(await asyncExec(buildCommand, baseDir));
        } catch (error) {
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
          return format(await asyncExec(lintCommand, baseDir));
        } catch (error) {
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
          return format(await asyncExec(formatCommand, baseDir));
        } catch (error) {
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
          return format(await asyncExec(testCommand, baseDir));
        } catch (error) {
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
  const { promise, resolve } = Promise.withResolvers<{
    stdout: string;
    stderr: string;
    code: number;
  }>();
  try {
    const [cmd, ...args] = command.split(" ");
    execFile(
      cmd,
      args,
      {
        cwd,
        timeout: 10 * 60 * 1000,
        shell: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          const errorCode = typeof error.code === "number" ? error.code : 1;
          resolve({
            stdout: stdout || "",
            stderr: stderr || "",
            code: errorCode,
          });
        } else {
          resolve({ stdout, stderr, code: 0 });
        }
      },
    );
  } catch (error) {
    console.error(error);
    resolve({ stdout: "", stderr: "", code: 1 });
  }
  return promise;
}
