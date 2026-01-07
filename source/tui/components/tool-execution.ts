import type { ToolEvent } from "../../agent/index.ts";
import { capitalize } from "../../formatting.ts";
import style from "../../terminal/style.ts";
import {
  Container,
  Loader,
  Markdown,
  Spacer,
  Text,
  type TUI,
} from "../index.ts";
import type { Component } from "../tui.ts";

type Status = ToolEvent["type"];

const bgColor = {
  r: 52,
  g: 53,
  b: 65,
};

export class ToolExecutionComponent extends Container {
  private tui: TUI;
  private contentContainer: Container;
  private loaderComponent: Loader | null;
  private toolName: string;
  private events: ToolEvent[];

  constructor(tui: TUI, events: ToolEvent[]) {
    super();
    this.tui = tui;
    this.loaderComponent = null;
    this.toolName = events[0].name;
    this.events = events;

    // Container for text/thinking content
    this.contentContainer = new Container();
    this.addChild(this.contentContainer);

    this.renderDisplay();
  }

  update(events: ToolEvent[]) {
    this.events = events;

    // Clear content container
    this.contentContainer.clear();

    this.renderDisplay();
  }

  private renderDisplay() {
    // Build display from complete event history with proper ordering
    const processedEvents = this.processEventsInOrder();

    const currentStatus = processedEvents.at(-1)?.type ?? "tool-call-start";

    this.contentContainer.addChild(new Spacer(1));
    this.contentContainer.addChild(new Spacer(1, bgColor));

    for (let i = 0; i < processedEvents.length; i++) {
      const event = processedEvents[i];

      const eventType = event.type;
      switch (eventType) {
        case "tool-call-start":
          this.getToolCallStartComponent(event, currentStatus);
          break;
        case "tool-call-update":
          this.contentContainer.addChild(
            new Markdown(this.handleToolUpdateMessage(event.msg), {
              paddingX: 3,
              customBgRgb: bgColor,
            }),
          );
          break;
        case "tool-call-end":
          // Render the actual tool output with truncation
          if (event.msg) {
            this.contentContainer.addChild(this.renderOutputDisplay(event.msg));
          }
          break;
        case "tool-call-error":
          this.contentContainer.addChild(
            new Text(
              `└ ${this.handleToolErrorMessage(event.msg)}`,
              1,
              0,
              bgColor,
            ),
          );
          break;
        default: {
          eventType satisfies never;
        }
      }
    }

    this.contentContainer.addChild(new Spacer(1, bgColor));
    this.contentContainer.addChild(new Spacer(1));
  }

  private getToolCallStartComponent(event: ToolEvent, currentStatus: Status) {
    switch (currentStatus) {
      case "tool-call-start":
        this.contentContainer.addChild(
          new Text(
            `${style.blue.bold("●")} ${this.handleToolStartMessage(event)}`,
            1,
            0,
            bgColor,
          ),
        );
        break;
      case "tool-call-update":
        if (!this.loaderComponent) {
          this.loaderComponent = new Loader(
            this.tui,
            this.handleToolStartMessage(event),
            false,
            bgColor,
          );
          this.contentContainer.addChild(this.loaderComponent);
        } else {
          this.loaderComponent.setMessage(this.handleToolStartMessage(event));
        }
        break;
      case "tool-call-end":
        if (this.loaderComponent) {
          this.loaderComponent.stop();
          this.loaderComponent = null;
        }
        this.contentContainer.addChild(
          new Text(
            `${style.green.bold("●")} ${this.handleToolStartMessage(event)}`,
            1,
            0,
            bgColor,
          ),
        );
        break;
      case "tool-call-error":
        if (this.loaderComponent) {
          this.loaderComponent.stop();
          this.loaderComponent = null;
        }
        this.contentContainer.addChild(
          new Text(
            `${style.red.bold("●")} ${this.handleToolStartMessage(event)}`,
            1,
            0,
            bgColor,
          ),
        );
        break;
      default:
        currentStatus satisfies never;
    }
  }

  private handleToolStartMessage(event: ToolEvent) {
    const message = event.msg;

    let result = `${style.bold(capitalize(this.toolName))} `;
    result += message.trim() ? `${style.bold(message)} ` : "";

    return result;
  }

  private handleToolUpdateMessage(message: string) {
    return message;
  }

  private renderOutputDisplay(msg: string): Component {
    const lines = msg.split("\n");
    const MaxVisible = 20;
    const MidPoint = 10;

    if (lines.length <= MaxVisible || lines.length <= 0) {
      return new Markdown(msg, { paddingX: 3, customBgRgb: bgColor });
    }

    const firstFive = lines.slice(0, MidPoint);
    const lastFive = lines.slice(-MidPoint);
    const indicator = `... (${lines.length - MaxVisible} more lines) ...`;

    const truncatedOutput = [
      firstFive.join("\n"),
      indicator,
      lastFive.join("\n"),
    ].join("\n");

    const container = new Container();
    const markdown = new Markdown(truncatedOutput, {
      paddingX: 3,
      customBgRgb: bgColor,
    });
    container.addChild(markdown);

    return container;
  }

  private handleToolErrorMessage(message: string) {
    return style.bold.red(message);
  }

  private processEventsInOrder(): ToolEvent[] {
    const events = [...this.events];
    const processed: ToolEvent[] = [];

    // Ensure we have a tool-call-start event for this specific tool call
    // Events are grouped by toolCallId, so we need to check for start events
    // that match the current tool call's ID
    const toolCallId = events[0]?.toolCallId;
    const hasStartEvent = events.some(
      (event) =>
        event.type === "tool-call-start" && event.toolCallId === toolCallId,
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

    processed.push(...events);

    processed.sort((a, b) => this.getEventIndex(a) - this.getEventIndex(b));

    return processed;
  }

  private getEventIndex(event: ToolEvent) {
    const eventType = event.type;
    switch (eventType) {
      case "tool-call-start":
        return 0;
      case "tool-call-update":
        return 1;
      case "tool-call-end":
      case "tool-call-error":
        return 2;
      default: {
        eventType satisfies never;
        return -1;
      }
    }
  }
}
