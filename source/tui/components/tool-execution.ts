import type { ToolEvent } from "../../agent/index.ts";
import { capitalize } from "../../formatting.ts";
import style from "../../terminal/style.ts";
import { Container, Spacer, Text } from "../index.ts";

type Status = ToolEvent["type"];

export class ToolExecutionComponent extends Container {
  private contentContainer: Container;
  private toolName: string;
  private events: ToolEvent[];

  constructor(event: ToolEvent) {
    super();
    this.toolName = event.name;
    this.events = [event];

    // Container for text/thinking content
    this.contentContainer = new Container();
    this.addChild(this.contentContainer);

    this.renderDisplay();
  }

  update(event: ToolEvent) {
    this.events.push(event);
    this.renderDisplay();
  }

  private renderDisplay() {
    // Clear content container
    this.contentContainer.clear();

    const lines: string[] = [];

    // Build display from complete event history with proper ordering
    const processedEvents = this.processEventsInOrder();

    for (let i = 0; i < processedEvents.length; i++) {
      const event = processedEvents[i];

      const eventType = event.type;
      switch (eventType) {
        case "tool-call-start":
          lines.push(`${this.handleToolInitMessage(event)}`);
          break;
        case "tool-call-update":
          lines.push(`├── ${this.handleToolUpdateMessage(event.msg)}`);
          break;
        case "tool-call-end":
          lines.push(`└── ${this.handleToolCompletionMessage(event.msg)}`);
          break;
        case "tool-call-error":
          lines.push(`└── ${this.handleToolErrorMessage(event.msg)}`);
          break;
        default: {
          eventType satisfies never;
        }
      }
    }

    // Render all lines with proper indicators
    const currentStatus = this.events[this.events.length - 1].type;
    const indicator = this.getIndicator(currentStatus);

    const displayLines: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (i === 0) {
        line = `${indicator} ${line}`;
      }
      displayLines.push(line);
    }

    this.contentContainer.addChild(new Spacer(1));

    this.contentContainer.addChild(
      new Text(displayLines.join("\n"), 1, 1, {
        r: 52,
        g: 53,
        b: 65,
      }),
    );
  }

  private getIndicator(status: Status) {
    switch (status) {
      case "tool-call-start":
        return style.blue.bold("●");
      case "tool-call-update":
        return style.yellow.bold("●");
      case "tool-call-end":
        return style.green.bold("●");
      case "tool-call-error":
        return style.red.bold("●");
      default:
        status satisfies never;
    }
    return style.blue.bold("●");
  }

  private handleToolInitMessage(event: ToolEvent) {
    const message = event.msg;

    let result = `${style.bold(capitalize(this.toolName))} `;
    result += message.trim() ? `${style.bold(message)} ` : "";
    result += style.dim(JSON.stringify(event.args).slice(0, 50));

    return result;
  }

  private handleToolUpdateMessage(message: string) {
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

  private handleToolCompletionMessage(message: string) {
    const newlineIndex = message.indexOf("\n");

    let result = "";

    if (newlineIndex === -1) {
      result += style.bold(message);
    } else {
      const firstLine = message.slice(0, newlineIndex);
      result += style.bold(firstLine);
    }
    return result;
  }

  private handleToolErrorMessage(message: string) {
    return style.bold.red(message);
  }

  private processEventsInOrder(): ToolEvent[] {
    const events = [...this.events];
    const processed: ToolEvent[] = [];

    // Ensure we have a tool-call-start event
    const hasStartEvent = events.some(
      (event) => event.type === "tool-call-start",
    );
    if (!hasStartEvent && events.length > 0) {
      // Create synthetic start event using the first event's name
      const firstEvent = events[0];
      processed.push({
        type: "tool-call-start",
        name: firstEvent.name,
        toolCallId: firstEvent.toolCallId,
        msg: "",
        args: firstEvent.args,
      });
    }

    // Process events in the correct order: start → update → end/error
    const startEvents = events.filter(
      (event) => event.type === "tool-call-start",
    );
    const updateEvents = events.filter(
      (event) => event.type === "tool-call-update",
    );
    const endEvents = events.filter((event) => event.type === "tool-call-end");
    const errorEvents = events.filter(
      (event) => event.type === "tool-call-error",
    );

    // Add start events first
    processed.push(...startEvents);

    // Add update events
    processed.push(...updateEvents);

    // Add end or error events (only one should be present)
    if (endEvents.length > 0) {
      processed.push(...endEvents);
    } else if (errorEvents.length > 0) {
      processed.push(...errorEvents);
    }

    return processed;
  }
}
