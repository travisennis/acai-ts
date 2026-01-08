import { join } from "node:path";
import pino from "pino";
import { config } from "./config.ts";

// Create a lazy logger factory that only initializes when first used
let loggerInstance: pino.Logger | null = null;

function createLogger(): pino.Logger {
  const isTest = process.env["NODE_ENV"] === "test";

  if (isTest) {
    return pino({
      level: "silent",
      enabled: false,
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
