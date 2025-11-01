import { logger } from "../logger.ts";
import type { Terminal } from "../terminal/index.ts";
import style from "../terminal/style.ts";
import type { Message } from "../tools/types.ts";

export function displayToolMessages(message: Message, terminal: Terminal) {
  const msg = message;
  switch (msg.event) {
    case "tool-completion":
      handleToolCompletionMessage(String(msg.data), terminal);
      break;
    case "tool-error":
      handleToolErrorMessage(String(msg.data), terminal);
      break;
    case "tool-init": {
      const indicator = style.blue.bold("●");
      const initMessage = msg.data;
      terminal.write(`${indicator} `);
      terminal.writeln(initMessage);
      break;
    }
    default:
      logger.debug(
        `Unhandled tool message event: ${(msg as { event: string }).event}`,
      );
      break;
  }

  terminal.lineBreak();
}

function handleToolCompletionMessage(data: string, terminal: Terminal) {
  const indicator = style.green.bold("●");
  terminal.writeln(`${indicator} ${style.bold(data)}`);
}

function handleToolErrorMessage(data: string, terminal: Terminal) {
  const indicator = style.red.bold("●");
  terminal.writeln(`${indicator} ${data}`);
}
