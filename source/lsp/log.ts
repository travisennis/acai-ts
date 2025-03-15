import { createWriteStream } from "node:fs";

const logFile = createWriteStream("/tmp/lsp.log");

export const log = {
  write: (message: object | unknown) => {
    if (typeof message === "object") {
      logFile.write(JSON.stringify(message));
    } else {
      logFile.write(message);
    }
    logFile.write("\n");
  },
};
