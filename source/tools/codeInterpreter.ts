import _crypto from "node:crypto";
import _fs from "node:fs";
import _http from "node:http";
import _https from "node:https";
import _os from "node:os";
import _process from "node:process";
import { runInNewContext } from "node:vm";
import { tool } from "ai";
import { z } from "zod";
import type { SendData } from "./types.ts";

type InterpreterPermission = "fs" | "net" | "os" | "crypto" | "process";

export function jsCodeInterpreter(
  code: string,
  permissions: readonly InterpreterPermission[],
) {
  const context: Record<string, any> = { console };

  if (permissions.includes("fs")) {
    context.fs = _fs;
  }
  if (permissions.includes("net")) {
    context.http = _http;
    context.https = _https;
  }
  if (permissions.includes("os")) {
    context.os = _os;
  }
  if (permissions.includes("crypto")) {
    context.crypto = _crypto;
  }
  if (permissions.includes("process")) {
    context.process = _process;
  }

  const options = { timeout: 120 * 1000 }; // Timeout in milliseconds

  return runInNewContext(`(function() { ${code} })()`, context, options);
}

export const createCodeInterpreterTool = ({
  permissions = [],
  sendData,
}: Readonly<{
  permissions?: readonly InterpreterPermission[];
  sendData?: SendData;
}>) => {
  return {
    codeInterpreter: tool({
      description:
        "Executes Javascript code. The code will be executed in a node:vm environment. This tool will respond with the output of the execution or time out after 120.0 seconds. In order to return a result from running this code, use a return statement. Do not use console.log. The code will run inside of self-executing anonymous function: `(function() { ${code} })()` Internet access for this session is disabled. Do not make external web requests or API calls as they will fail. Fileystem access for this vm is disabled. Do not make filesystem calls as they will fail. Dot use require.",
      parameters: z.object({
        code: z.string().describe("Javascript code to be executed."),
      }),
      execute: ({ code }) => {
        try {
          sendData?.({
            event: "tool-init",
            data: "Initializing code interpreter environment",
          });

          const result = jsCodeInterpreter(code, permissions ?? []);

          sendData?.({
            event: "tool-completion",
            data: "Code execution completed successfully",
          });

          return Promise.resolve(JSON.stringify(result, null, 2));
        } catch (err) {
          const errorMessage =
            (err as Error).name === "TimeoutError"
              ? "Script timed out"
              : `Error: ${err}`;

          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });

          return Promise.resolve(errorMessage);
        }
      },
    }),
  };
};
