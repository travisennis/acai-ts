import { capitalize } from "../formatting.ts";
import { logger } from "../logger.ts";
import type { Terminal } from "../terminal/index.ts";
import style from "../terminal/style.ts";
import type { Message } from "../tools/types.ts";

export function displayToolMessages(message: Message, terminal: Terminal) {
  switch (message.event) {
    case "tool-completion":
      handleToolCompletionMessage(message, terminal);
      break;
    case "tool-error":
      handleToolErrorMessage(message, terminal);
      break;
    case "tool-init":
      handleToolInitMessage(message, terminal);
      break;
    default:
      logger.debug(
        `Unhandled tool message event: ${(message as { event: string }).event}`,
      );
      break;
  }

  terminal.lineBreak();
}

function handleToolInitMessage(
  message: Message & { event: "tool-init" },
  terminal: Terminal,
) {
  const indicator = style.blue.bold("●");
  const data = String(message.data);
  const newlineIndex = data.indexOf("\n");

  terminal.write(`${indicator} ${style.bold(capitalize(message.name))} `);

  if (newlineIndex === -1) {
    terminal.writeln(style.bold(data));
  } else {
    const firstLine = data.slice(0, newlineIndex);
    const remainingLines = data.slice(newlineIndex + 1);
    terminal.writeln(style.bold(firstLine));
    if (remainingLines.trim()) {
      terminal.display(remainingLines);
    }
  }
}

function handleToolCompletionMessage(
  message: Message & { event: "tool-completion" },
  terminal: Terminal,
) {
  const indicator = style.green.bold("●");
  const data = String(message.data);
  const newlineIndex = data.indexOf("\n");

  terminal.write(`${indicator} ${style.bold(capitalize(message.name))} `);

  if (newlineIndex === -1) {
    terminal.writeln(style.bold(data));
  } else {
    const firstLine = data.slice(0, newlineIndex);
    const remainingLines = data.slice(newlineIndex + 1);
    terminal.writeln(style.bold(firstLine));
    if (remainingLines.trim()) {
      terminal.display(remainingLines);
    }
  }
}

function handleToolErrorMessage(
  message: Message & { event: "tool-error" },
  terminal: Terminal,
) {
  const indicator = style.red.bold("●");
  terminal.writeln(
    `${indicator} ${style.bold(capitalize(message.name))} ${message.data}`,
  );
}
