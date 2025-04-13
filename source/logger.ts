import { join } from "node:path";
import pino from "pino";
import { config } from "./config.ts";

const transport = pino.transport({
  target: "pino-roll",
  options: {
    file: join(config.app.ensurePath("logs"), "acai.log"),
    size: "10m",
    symlink: true,
    limit: {
      count: 3,
    },
    mkdir: true,
  },
});

export const logger = pino(
  {
    level: process.env["LOG_LEVEL"] ?? "debug",
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport,
);
