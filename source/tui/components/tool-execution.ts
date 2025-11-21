import { capitalize } from "../../formatting.ts";
import style from "../../terminal/style.ts";
import { Container, Spacer, Text } from "../index.ts";

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
  private startText: Text;
  private endText: Text;
  private toolName: string;
  private message: string;
  private status: "start" | "running" | "done" | "error";
  private initialMessage: string;

  constructor(
    event: ToolEvent,
    status: "start" | "running" | "done" | "error",
  ) {
    super();
    this.toolName = event.name;
    this.message = event.msg;
    this.status = status;
    this.initialMessage = event.msg;
    this.addChild(new Spacer(1));
    this.startText = new Text(this.handleToolInitMessage(), 0, 0);
    this.addChild(this.startText);
    this.endText = new Text("...", 0, 0);
    this.addChild(this.endText);
  }

  update(event: ToolEvent, status: "running" | "done" | "error") {
    this.toolName = event.name;
    if (status === "running") {
      this.initialMessage = event.msg;
    } else {
      this.message = event.msg;
    }
    this.status = status;
    switch (this.status) {
      case "running":
        this.startText.setText(this.handleToolInitMessage());
        break;
      case "done":
        this.endText.setText(`-- ${this.handleToolCompletionMessage()}`);
        break;
      case "error":
        this.endText.setText(`-- ${this.handleToolErrorMessage()}`);
        break;
    }
  }

  private handleToolInitMessage() {
    const indicator = style.blue.bold("●");
    const message = String(this.initialMessage);
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
    const message = String(this.message);
    const newlineIndex = message.indexOf("\n");

    let result = "";

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
    return this.message;
  }
}
