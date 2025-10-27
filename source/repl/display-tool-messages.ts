import { logger } from "../logger.ts";
import type { Terminal } from "../terminal/index.ts";
// import { isMarkdown } from "../terminal/markdown-utils.ts";
import style from "../terminal/style.ts";
import type { Message } from "../tools/types.ts";

export function displayToolMessages(message: Message, terminal: Terminal) {
  const msg = message;
  switch (msg.event) {
    case "tool-update":
      // handleToolUpdateMessage(
      //   msg.data as { primary: string; secondary?: string[] },
      //   terminal,
      // );
      break;
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

// function handleToolUpdateMessage(
//   data: { primary: string; secondary?: string[] },
//   terminal: Terminal,
// ) {
//   if (data.secondary && data.secondary.length > 0) {
//     const content = data.secondary.join("\n");
//     if (content.trim().length !== 0) {
//       terminal.header(`${data.primary}`);
//       if (isMarkdown(content)) {
//         terminal.display(content, true);
//       } else {
//         terminal.write(style.green(content));
//         terminal.lineBreak();
//       }
//       terminal.hr();
//     }
//   } else {
//     terminal.header(`${data.primary}`);
//   }
// }

function handleToolCompletionMessage(data: string, terminal: Terminal) {
  const indicator = style.green.bold("●");
  terminal.display(`${indicator} ${style.bold(data)}`);
}

function handleToolErrorMessage(data: string, terminal: Terminal) {
  const indicator = style.red.bold("●");
  terminal.error(`${indicator} ${data}`);
}
