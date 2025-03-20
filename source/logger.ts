import { join } from "node:path";
import pino from "pino";
import { config } from "./config.ts";

const transport = pino.transport({
  target: "pino-roll",
  options: {
    file: join(config.app.ensurePath("logs"), "acai.log"),
    size: "10m",
    interval: "1d",
    mkdir: true,
  },
});

export const logger = pino(
  {
    level: process.env["LOG_LEVEL"] ?? "info",
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() };
      },
    },
  },
  transport,
);
