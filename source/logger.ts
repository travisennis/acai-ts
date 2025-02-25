import fs from "node:fs";
import { join } from "node:path";
import envPaths from "@travisennis/stdlib/env";
import pino from "pino";

const logDir = envPaths("acai").logs;
fs.mkdirSync(logDir, { recursive: true });

const transport = pino.transport({
  target: "pino-roll",
  options: {
    file: join(logDir, "acai.log"),
    size: "10m",
    interval: "1d",
    mkdir: true,
  },
});

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() };
      },
    },
  },
  transport,
);
