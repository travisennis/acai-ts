import { strict as assert } from "node:assert";
import { test } from "node:test";
import { tool } from "ai";
import { z } from "zod";
import {
  buildManualToolset,
  type ManualToolset,
} from "../../source/tools/manual-tools-adapter.ts";

type EchoInput = { text: string };

const echoTool = {
  echo: tool<EchoInput, string>({
    description: "Echo input",
    inputSchema: z.object({ text: z.string() }),
    async execute(input: EchoInput) {
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
