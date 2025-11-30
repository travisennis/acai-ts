import type { ToolEvent } from "../../agent/index.ts";
import { capitalize } from "../../formatting.ts";
import { formatMarkdown } from "../../terminal/index.ts";
import style from "../../terminal/style.ts";
import { Container, Spacer, Text } from "../index.ts";

type Status = ToolEvent["type"];

export class ToolExecutionComponent extends Container {
  private contentContainer: Container;
  private toolName: string;
  private events: ToolEvent[];
  private loaderFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private currentLoaderFrame = 0;
  private loaderIntervalId: NodeJS.Timeout | null = null;

  constructor(events: ToolEvent[]) {
    super();
    this.toolName = events[0].name;
    this.events = events;

    // Container for text/thinking content
    this.contentContainer = new Container();
    this.addChild(this.contentContainer);

    this.renderDisplay();
  }

  update(events: ToolEvent[]) {
    this.events = events;
    this.renderDisplay();
  }

  private startLoaderAnimation() {
    if (this.loaderIntervalId) {
      return;
    }

    this.loaderIntervalId = setInterval(() => {
      this.currentLoaderFrame =
        (this.currentLoaderFrame + 1) % this.loaderFrames.length;
      this.renderDisplay();
    }, 80);
  }

  private stopLoaderAnimation() {
    if (this.loaderIntervalId) {
      clearInterval(this.loaderIntervalId);
      this.loaderIntervalId = null;
    }
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
          lines.push(`${this.handleToolStartMessage(event)}`);
          break;
        case "tool-call-init":
          lines.push(`→  ${this.handleToolInitMessage(event.msg)}`);
          break;
        case "tool-call-update":
          lines.push(`${this.handleToolUpdateMessage(event.msg)}`);
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

    // Manage loader animation based on status
    if (currentStatus === "tool-call-update") {
      this.startLoaderAnimation();
    } else {
      this.stopLoaderAnimation();
    }

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
      case "tool-call-init":
        return style.blue.bold("●");
      case "tool-call-update":
        return style.yellow.bold(this.loaderFrames[this.currentLoaderFrame]);
      case "tool-call-end":
        return style.green.bold("●");
      case "tool-call-error":
        return style.red.bold("●");
      default:
        status satisfies never;
    }
    return style.blue.bold("●");
  }

  private handleToolStartMessage(event: ToolEvent) {
    const message = event.msg;

    let result = `${style.bold(capitalize(this.toolName))} `;
    result += message.trim() ? `${style.bold(message)} ` : "";
    result += style.dim(JSON.stringify(event.args).slice(0, 50));

    return result;
  }

  private handleToolInitMessage(message: string) {
    return style.bold(message);
  }

  private handleToolUpdateMessage(message: string) {
    return formatMarkdown(message);
  }

  private handleToolCompletionMessage(message: string) {
    return style.bold(message);
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
    const initEvents = events.filter(
      (event) => event.type === "tool-call-init",
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

    // Add init events
    processed.push(...initEvents);

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
