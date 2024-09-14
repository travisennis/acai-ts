import pino from "pino";
import { join } from "path";
import { xdgData } from "xdg-basedir";
import fs from "fs";

const logDir = join(xdgData || "~/.local/share", "acai", "logs");
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
    level: process.env.LOG_LEVEL || "info",
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() };
      },
    },
  },
  transport,
);

export default logger;
