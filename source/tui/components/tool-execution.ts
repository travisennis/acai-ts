import { capitalize } from "../../formatting.ts";
import style from "../../terminal/style.ts";
import { Container, Text } from "../index.ts";

type ToolEvent =
  | {
      type: "tool-call-start";
      name: string;
      toolCallId: string;
      msg: string;
      args: unknown;
    }
  | {
      type: "tool-call-update";
      name: string;
      toolCallId: string;
      msg: string;
      args: unknown;
    }
  | {
      type: "tool-call-end";
      name: string;
      toolCallId: string;
      msg: string;
      args: unknown;
    }
  | {
      type: "tool-call-error";
      name: string;
      toolCallId: string;
      msg: string;
      args: unknown;
    };

export class ToolExecutionComponent extends Container {
  private text: Text;
  private toolName: string;
  private message: string;
  private status: "start" | "running" | "done" | "error";

  constructor(
    event: ToolEvent,
    status: "start" | "running" | "done" | "error",
  ) {
    super();
    this.toolName = event.name;
    this.message = event.msg;
    this.status = status;

    this.text = new Text(this.makeText());
    this.addChild(this.text);
  }

  update(event: ToolEvent, status: "start" | "running" | "done" | "error") {
    this.toolName = event.name;
    this.message = event.msg;
    this.status = status;

    this.text.setText(this.makeText());
  }

  private makeText() {
    let message = "";
    switch (this.status) {
      case "start":
        message = this.handleToolInitMessage();
        break;
      case "running":
        message = this.handleToolInitMessage();
        break;
      case "done":
        message = this.handleToolCompletionMessage();
        break;
      case "error":
        message = this.handleToolErrorMessage();
        break;
      default:
        message = `${style.blue.bold("●")} ${style.bold(capitalize(this.toolName))} unknown event`;
    }

    return message;
  }

  private handleToolInitMessage() {
    const indicator = style.blue.bold("●");
    const message = String(this.message);
    const newlineIndex = message.indexOf("\n");

    let result = `${indicator} ${style.bold(capitalize(this.toolName))} `;

    if (newlineIndex === -1) {
      result += style.bold(message);
    } else {
      const firstLine = message.slice(0, newlineIndex);
      // const remainingLines = message.slice(newlineIndex + 1);
      result += style.bold(firstLine);
      // if (remainingLines.trim()) {
      //   terminal.display(remainingLines);
      // }
    }
    return result;
  }

  private handleToolCompletionMessage() {
    const indicator = style.green.bold("●");
    const message = String(this.message);
    const newlineIndex = message.indexOf("\n");

    let result = `${indicator} ${style.bold(capitalize(this.toolName))} `;

    if (newlineIndex === -1) {
      result += style.bold(message);
    } else {
      const firstLine = message.slice(0, newlineIndex);
      // const remainingLines = message.slice(newlineIndex + 1);
      result += style.bold(firstLine);
      // if (remainingLines.trim()) {
      //   terminal.display(remainingLines);
      // }
    }
    return result;
  }

  private handleToolErrorMessage() {
    const indicator = style.red.bold("●");
    return `${indicator} ${style.bold(capitalize(this.toolName))} ${this.message}`;
  }
}
