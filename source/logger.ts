import fs from "node:fs";
import { join } from "node:path";
import pino from "pino";
import { getAppConfigDir } from "./config.ts";

const logDir = join(getAppConfigDir(), "logs");
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
