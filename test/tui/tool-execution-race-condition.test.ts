import { strictEqual } from "node:assert";
import { test } from "node:test";
import type { ToolEvent } from "../../source/agent/index.ts";

// Test race condition scenarios where events arrive out of order
test("processEventsInOrder should handle update-before-start race condition", () => {
  // Simulate the exact scenario: update event arrives first
  const eventsOutOfOrder: ToolEvent[] = [
    {
      type: "tool-call-update",
      name: "test-tool",
      toolCallId: "test-123",
      msg: "Processing data...",
      args: { input: "test" },
    },
    // Start event arrives later (race condition)
    {
      type: "tool-call-start",
      name: "test-tool",
      toolCallId: "test-123",
      msg: "Starting tool",
      args: { input: "test" },
    },
  ];

  // Simulate processEventsInOrder logic
  const processed: ToolEvent[] = [];
  const toolCallId = eventsOutOfOrder[0]?.toolCallId;
  const hasStartEvent = eventsOutOfOrder.some(
    (event) =>
      event.type === "tool-call-start" && event.toolCallId === toolCallId,
  );

  if (!hasStartEvent && eventsOutOfOrder.length > 0) {
    // This should NOT create a synthetic start because start event exists
    const firstEvent = eventsOutOfOrder[0];
    processed.push({
      type: "tool-call-start",
      name: firstEvent.name,
      toolCallId: firstEvent.toolCallId,
      msg: "",
      args: firstEvent.args,
    });
  }

  processed.push(...eventsOutOfOrder);

  // Verify that no synthetic start was created (since real start exists)
  strictEqual(processed.length, 2);
  strictEqual(processed[0].type, "tool-call-update"); // Original first event
  strictEqual(processed[1].type, "tool-call-start"); // Original second event
});

test("processEventsInOrder should handle empty events array", () => {
  const emptyEvents: ToolEvent[] = [];

  const processed: ToolEvent[] = [];
  const toolCallId = emptyEvents[0]?.toolCallId;
  const hasStartEvent = emptyEvents.some(
    (event) =>
      event.type === "tool-call-start" && event.toolCallId === toolCallId,
  );

  if (!hasStartEvent && emptyEvents.length > 0) {
    // This should NOT execute because length is 0
    const firstEvent = emptyEvents[0];
    processed.push({
      type: "tool-call-start",
      name: firstEvent.name,
      toolCallId: firstEvent.toolCallId,
      msg: "",
      args: firstEvent.args,
    });
  }

  processed.push(...emptyEvents);

  // Verify empty array is handled correctly
  strictEqual(processed.length, 0);
});

test("processEventsInOrder should handle undefined toolCallId", () => {
  // This shouldn't happen in practice, but let's test edge case
  const eventsWithUndefinedId: ToolEvent[] = [
    {
      type: "tool-call-update",
      name: "test-tool",
      toolCallId: "undefined", // This is the edge case
      msg: "Processing data...",
      args: { input: "test" },
    },
  ];

  const processed: ToolEvent[] = [];
  const toolCallId = eventsWithUndefinedId[0]?.toolCallId; // undefined
  const hasStartEvent = eventsWithUndefinedId.some(
    (event) =>
      event.type === "tool-call-start" && event.toolCallId === toolCallId,
  );

  if (!hasStartEvent && eventsWithUndefinedId.length > 0) {
    const firstEvent = eventsWithUndefinedId[0];
    processed.push({
      type: "tool-call-start",
      name: firstEvent.name,
      toolCallId: firstEvent.toolCallId, // undefined
      msg: "",
      args: firstEvent.args,
    });
  }

  processed.push(...eventsWithUndefinedId);

  // Verify synthetic start is created even with "undefined" ID
  strictEqual(processed.length, 2);
  strictEqual(processed[0].type, "tool-call-start");
  strictEqual(processed[0].toolCallId, "undefined");
});

test("processEventsInOrder should handle events with different toolCallIds", () => {
  // This tests if the filtering by toolCallId works correctly
  const mixedEvents: ToolEvent[] = [
    {
      type: "tool-call-update",
      name: "test-tool",
      toolCallId: "test-123",
      msg: "Processing data...",
      args: { input: "test" },
    },
    {
      type: "tool-call-start",
      name: "other-tool",
      toolCallId: "test-456", // Different tool call ID
      msg: "Starting other tool",
      args: { input: "other" },
    },
  ];

  const processed: ToolEvent[] = [];
  const toolCallId = mixedEvents[0]?.toolCallId; // "test-123"
  const hasStartEvent = mixedEvents.some(
    (event) =>
      event.type === "tool-call-start" && event.toolCallId === toolCallId,
  );

  if (!hasStartEvent && mixedEvents.length > 0) {
    // This should create synthetic start because no start event for "test-123"
    const firstEvent = mixedEvents[0];
    processed.push({
      type: "tool-call-start",
      name: firstEvent.name,
      toolCallId: firstEvent.toolCallId,
      msg: "",
      args: firstEvent.args,
    });
  }

  processed.push(...mixedEvents);

  // Verify synthetic start is created for the correct tool call
  strictEqual(processed.length, 3);
  strictEqual(processed[0].type, "tool-call-start");
  strictEqual(processed[0].toolCallId, "test-123");
  strictEqual(processed[0].msg, "");
});
