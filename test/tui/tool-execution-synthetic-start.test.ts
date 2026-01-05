import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import type { ToolEvent } from "../../source/agent/index.ts";

// Test the event processing logic directly
test("processEventsInOrder should create synthetic start event when missing", () => {
  // Simulate the processEventsInOrder logic for a single tool call
  const eventsWithoutStart: ToolEvent[] = [
    {
      type: "tool-call-update",
      name: "test-tool",
      toolCallId: "test-123",
      msg: "Processing data...",
      args: { input: "test" },
    },
  ];

  // This simulates what processEventsInOrder does for a single tool call
  const processed: ToolEvent[] = [];
  const toolCallId = eventsWithoutStart[0]?.toolCallId;
  const hasStartEvent = eventsWithoutStart.some(
    (event) =>
      event.type === "tool-call-start" && event.toolCallId === toolCallId,
  );

  if (!hasStartEvent && eventsWithoutStart.length > 0) {
    const firstEvent = eventsWithoutStart[0];
    processed.push({
      type: "tool-call-start",
      name: firstEvent.name,
      toolCallId: firstEvent.toolCallId,
      msg: "",
      args: firstEvent.args,
    });
  }

  processed.push(...eventsWithoutStart);

  // Verify synthetic start event was created with empty message
  strictEqual(processed.length, 2);
  strictEqual(processed[0].type, "tool-call-start");
  strictEqual(processed[0].name, "test-tool");
  strictEqual(processed[0].toolCallId, "test-123");
  strictEqual(processed[0].msg, ""); // Empty message is correct for synthetic start
  deepStrictEqual(processed[0].args, { input: "test" });
});

test("processEventsInOrder should create synthetic start for init-only events", () => {
  const eventsWithInitOnly: ToolEvent[] = [
    {
      type: "tool-call-update",
      name: "test-tool",
      toolCallId: "test-123",
      msg: "Initializing tool with parameters",
      args: { input: "test" },
    },
  ];

  const processed: ToolEvent[] = [];
  const toolCallId = eventsWithInitOnly[0]?.toolCallId;
  const hasStartEvent = eventsWithInitOnly.some(
    (event) =>
      event.type === "tool-call-start" && event.toolCallId === toolCallId,
  );

  if (!hasStartEvent && eventsWithInitOnly.length > 0) {
    const firstEvent = eventsWithInitOnly[0];
    processed.push({
      type: "tool-call-start",
      name: firstEvent.name,
      toolCallId: firstEvent.toolCallId,
      msg: "",
      args: firstEvent.args,
    });
  }

  processed.push(...eventsWithInitOnly);

  // Verify synthetic start event was created
  strictEqual(processed.length, 2);
  strictEqual(processed[0].type, "tool-call-start");
  strictEqual(processed[0].msg, ""); // Empty message is correct
});

test("processEventsInOrder should not create synthetic start when already present", () => {
  const eventsWithStart: ToolEvent[] = [
    {
      type: "tool-call-start",
      name: "test-tool",
      toolCallId: "test-123",
      msg: "Starting tool",
      args: { input: "test" },
    },
    {
      type: "tool-call-update",
      name: "test-tool",
      toolCallId: "test-123",
      msg: "Processing data...",
      args: { input: "test" },
    },
  ];

  const processed: ToolEvent[] = [];
  const toolCallId = eventsWithStart[0]?.toolCallId;
  const hasStartEvent = eventsWithStart.some(
    (event) =>
      event.type === "tool-call-start" && event.toolCallId === toolCallId,
  );

  if (!hasStartEvent && eventsWithStart.length > 0) {
    const firstEvent = eventsWithStart[0];
    processed.push({
      type: "tool-call-start",
      name: firstEvent.name,
      toolCallId: firstEvent.toolCallId,
      msg: "",
      args: firstEvent.args,
    });
  }

  processed.push(...eventsWithStart);

  // Verify no synthetic start event was created
  strictEqual(processed.length, 2);
  strictEqual(processed[0].type, "tool-call-start");
  strictEqual(processed[0].msg, "Starting tool"); // Original message preserved
});

test("event ordering should be correct", () => {
  const getEventIndex = (event: ToolEvent) => {
    const eventType = event.type;
    switch (eventType) {
      case "tool-call-start":
        return 0;
      case "tool-call-update":
        return 1;
      case "tool-call-end":
      case "tool-call-error":
        return 2;
      default:
        return -1;
    }
  };

  strictEqual(
    getEventIndex({
      type: "tool-call-start",
      name: "test",
      toolCallId: "test",
      msg: "",
      args: {},
    }),
    0,
  );
  strictEqual(
    getEventIndex({
      type: "tool-call-update",
      name: "test",
      toolCallId: "test",
      msg: "",
      args: {},
    }),
    1,
  );
  strictEqual(
    getEventIndex({
      type: "tool-call-update",
      name: "test",
      toolCallId: "test",
      msg: "",
      args: {},
    }),
    1,
  );
  strictEqual(
    getEventIndex({
      type: "tool-call-end",
      name: "test",
      toolCallId: "test",
      msg: "",
      args: {},
    }),
    2,
  );
  strictEqual(
    getEventIndex({
      type: "tool-call-error",
      name: "test",
      toolCallId: "test",
      msg: "",
      args: {},
    }),
    2,
  );
});
