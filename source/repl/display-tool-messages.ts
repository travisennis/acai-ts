import { logger } from "../logger.ts";
import type { Terminal } from "../terminal/index.ts";
import { isMarkdown } from "../terminal/markdown-utils.ts";
import style from "../terminal/style.ts";
import type { Message } from "../tools/types.ts";

export function displayToolMessages(messages: Message[], terminal: Terminal) {
  const isError = messages[messages.length - 1]?.event === "tool-error";
  const indicator = isError ? style.red.bold("●") : style.blue.bold("●");
  const initMessage =
    messages.find((m) => m.event === "tool-init")?.data ?? "Tool Execution";

  terminal.write(`${indicator} `);
  terminal.display(initMessage);

  for (const msg of messages) {
    switch (msg.event) {
      case "tool-update":
        handleToolUpdateMessage(
          msg.data as { primary: string; secondary?: string[] },
          terminal,
        );
        break;
      case "tool-completion":
        handleToolCompletionMessage(String(msg.data), terminal);
        break;
      case "tool-error":
        handleToolErrorMessage(String(msg.data), terminal);
        break;
      case "tool-init":
        break;
      default:
        logger.debug(
          `Unhandled tool message event: ${(msg as { event: string }).event}`,
        );
        break;
    }
  }
  terminal.lineBreak();
}

function handleToolUpdateMessage(
  data: { primary: string; secondary?: string[] },
  terminal: Terminal,
) {
  if (data.secondary && data.secondary.length > 0) {
    const content = data.secondary.join("\n");
    if (content.trim().length !== 0) {
      terminal.display(`└── ${data.primary}`);
      terminal.hr();
      if (isMarkdown(content)) {
        terminal.display(content, true);
      } else {
        terminal.write(style.green(content));
        terminal.lineBreak();
      }
      terminal.hr();
    }
  } else {
    terminal.display(`└── ${data.primary}`);
  }
}

function handleToolCompletionMessage(data: string, terminal: Terminal) {
  terminal.display(`└── ${data}`);
}

function handleToolErrorMessage(data: string, terminal: Terminal) {
  terminal.write("└── ");
  terminal.error(data);
}
