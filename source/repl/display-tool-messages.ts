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
    case "tool-init":
      handleToolInitMessage(String(msg.data), terminal);
      break;
    default:
      logger.debug(
        `Unhandled tool message event: ${(msg as { event: string }).event}`,
      );
      break;
  }

  terminal.lineBreak();
}

function handleToolInitMessage(data: string, terminal: Terminal) {
  const indicator = style.blue.bold("●");
  const message = String(data);
  const newlineIndex = message.indexOf("\n");

  terminal.write(`${indicator} `);

  if (newlineIndex === -1) {
    terminal.writeln(style.bold(message));
  } else {
    const firstLine = message.slice(0, newlineIndex);
    const remainingLines = message.slice(newlineIndex + 1);
    terminal.writeln(style.bold(firstLine));
    if (remainingLines.trim()) {
      terminal.display(remainingLines);
    }
  }
}

function handleToolCompletionMessage(data: string, terminal: Terminal) {
  const indicator = style.green.bold("●");
  const message = String(data);
  const newlineIndex = message.indexOf("\n");

  terminal.write(`${indicator} `);

  if (newlineIndex === -1) {
    terminal.writeln(style.bold(message));
  } else {
    const firstLine = message.slice(0, newlineIndex);
    const remainingLines = message.slice(newlineIndex + 1);
    terminal.writeln(style.bold(firstLine));
    if (remainingLines.trim()) {
      terminal.display(remainingLines);
    }
  }
}

function handleToolErrorMessage(data: string, terminal: Terminal) {
  const indicator = style.red.bold("●");
  terminal.writeln(`${indicator} ${data}`);
}
