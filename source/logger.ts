import { join } from "node:path";
import pino from "pino";
import { config } from "./config.ts";

// Create a lazy logger factory that only initializes when first used
let loggerInstance: pino.Logger | null = null;

function createLogger(): pino.Logger {
  // Check if we're running in code interpreter context
  // Try multiple detection methods:
  // 1. Environment variable (primary method)
  // 2. Check if we're running with Node.js permissions (fallback)
  const isCodeInterpreter =
    process.env["ACAI_CODE_INTERPRETER"] === "true" ||
    (typeof process.permission !== "undefined" &&
      process.permission.has !== undefined);

  if (isCodeInterpreter) {
    // In code interpreter context, use a no-op logger to avoid noise in script output
    return pino({
      level: "silent", // Completely disable logging
      enabled: false, // Disable the logger entirely
    });
  }
  // Normal file-based logging
  return pino(
    {
      level: process.env["LOG_LEVEL"] ?? "debug",
      formatters: {
        level: (label) => {
          return { level: label.toUpperCase() };
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.transport({
      target: "pino-roll",
      options: {
        file: join(config.app.ensurePathSync("logs"), "acai.log"),
        size: "10m",
        symlink: true,
        limit: {
          count: 3,
        },
        mkdir: true,
      },
    }),
  );
}

function getLogger(): pino.Logger {
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }
  return loggerInstance;
}

export const logger = new Proxy({} as pino.Logger, {
  get(_target, prop) {
    return getLogger()[prop as keyof pino.Logger];
  },
});
