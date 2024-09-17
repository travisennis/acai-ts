import * as _crypto from "node:crypto";
import * as _fs from "node:fs";
import * as _http from "node:http";
import * as _https from "node:https";
import * as _os from "node:os";
import * as _process from "node:process";
import { runInNewContext } from "node:vm";
import { tool } from "ai";
import { z } from "zod";

export enum InterpreterPermission {
  FS = "node:fs",
  NET = "net",
  OS = "os",
  CRYPTO = "crypto",
  PROCESS = "process",
}

function codeInterpreterJavascript(
  code: string,
  permissions: readonly InterpreterPermission[],
) {
  const context: { [key: string]: unknown } = { console };

  if (permissions.includes(InterpreterPermission.FS)) {
    context.fs = _fs;
  }

  if (permissions.includes(InterpreterPermission.NET)) {
    context.http = _http;
    context.https = _https;
  }

  if (permissions.includes(InterpreterPermission.OS)) {
    context.os = _os;
  }

  if (permissions.includes(InterpreterPermission.CRYPTO)) {
    context.crypto = _crypto;
  }

  if (permissions.includes(InterpreterPermission.PROCESS)) {
    context.process = _process;
  }

  return runInNewContext(`(function() { ${code} })()`, context);
}

export function initTool({
  permissions = [],
}:
  | Readonly<{ permissions?: readonly InterpreterPermission[] }>
  | undefined = {}) {
  return tool({
    description:
      "Use this function to run Javascript code and get any expected return value.",
    parameters: z.object({
      code: z
        .string()
        .describe(
          "JS code with a return value in the end. The last line should be a return statement.",
        ),
    }),
    execute: ({ code }) => {
      return codeInterpreterJavascript(code, permissions ?? []);
    },
  });
}
