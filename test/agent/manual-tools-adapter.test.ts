import { strict as assert } from "node:assert";
import { test } from "node:test";
import { type ToolCallOptions, type ToolExecuteFunction, tool } from "ai";
import { z } from "zod";
import {
  buildManualToolset,
  type ManualToolset,
} from "../../source/tools/manual-tools-adapter.ts";
import type { Message } from "../../source/tools/types.ts";

type EchoInput = { text: string };

type FallbackInput = { value: string };

type StreamInput = { text: string };

const echoTool = {
  echo: tool<EchoInput, string>({
    description: "Echo input",
    inputSchema: z.object({ text: z.string() }),
    async execute(input: EchoInput) {
      return input.text;
    },
  }),
};

const noExecutorTool = {
  noExec: tool({
    description: "Needs fallback",
    inputSchema: z.object({ value: z.string() }),
  }),
};

const streamingTool = {
  streamer: tool<StreamInput, Message | string>({
    description: "Streams messages",
    inputSchema: z.object({ text: z.string() }),
    async *execute(input: StreamInput, ctx: ToolCallOptions) {
      const initMessage: Message = {
        event: "tool-init",
        id: ctx.toolCallId,
        data: "start",
      };
      const completionMessage: Message = {
        event: "tool-completion",
        id: ctx.toolCallId,
        data: "done",
      };
      yield initMessage;
      yield completionMessage;
      return input.text;
    },
  }),
};

test("buildManualToolset separates schema and executors", async () => {
  const { toolDefs, executors }: ManualToolset<typeof echoTool> =
    buildManualToolset(echoTool);
  const schemaEcho = (toolDefs as Record<string, unknown>)["echo"] as {
    execute?: unknown;
  };
  assert.ok(schemaEcho);
  assert.equal(schemaEcho.execute, undefined);
  const exec = executors.get("echo");
  assert.ok(exec);
  const out = await exec?.({ text: "hi" }, { toolCallId: "1" } as never);
  assert.equal(out, "hi");
});

test("buildManualToolset uses fallback executors when execute missing", async () => {
  const fallback: ToolExecuteFunction<unknown, string> = async (input) => {
    const typed = input as FallbackInput;
    return typed.value;
  };
  const { executors }: ManualToolset<typeof noExecutorTool> =
    buildManualToolset(noExecutorTool, {
      fallbackExecutors: { noExec: fallback },
    });
  const exec = executors.get("noExec");
  assert.ok(exec);
  const result = await exec?.({ value: "fallback result" }, {
    toolCallId: "2",
  } as never);
  assert.equal(result, "fallback result");
});

test("buildManualToolset captures async iterable outputs and messages", async () => {
  const messages: Message[] = [];
  const { executors }: ManualToolset<typeof streamingTool> = buildManualToolset(
    streamingTool,
    {
      onMessage: (_toolCallId, message) => {
        messages.push(message);
      },
    },
  );
  const exec = executors.get("streamer");
  assert.ok(exec);
  const output = await exec?.({ text: "final" }, {
    toolCallId: "stream",
  } as never);
  assert.equal(output, "final");
  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.event, "tool-init");
  assert.equal(messages[1]?.event, "tool-completion");
});
