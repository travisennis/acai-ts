import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { loadDynamicTools } from "../../source/tools/dynamic-tool-loader.ts";

test("Dynamic tool integration - end-to-end functionality", async () => {
  // Create a temporary test tool
  const testToolContent = `#!/usr/bin/env node

import { spawn } from 'node:child_process';

if (process.env.TOOL_ACTION === 'describe') {
  console.log(JSON.stringify({
    name: 'test-integration',
    description: 'Test tool for integration testing',
    parameters: [
      {
        name: 'message',
        type: 'string',
        description: 'Message to echo back',
        required: true
      },
      {
        name: 'count',
        type: 'number',
        description: 'Number of times to repeat',
        required: false,
        default: 1
      }
    ]
  }, null, 2));
  process.exit(0);
}

if (process.env.TOOL_ACTION === 'execute') {
  let params = [];
  process.stdin.setEncoding('utf8');
  process.stdin.on('readable', () => {
    let chunk;
    while (null !== (chunk = process.stdin.read())) {
      params = JSON.parse(chunk);
    }
  });

  process.stdin.on('end', () => {
    const message = params.find(p => p.name === 'message')?.value || 'default';
    const count = params.find(p => p.name === 'count')?.value || 1;
    
    let result = '';
    for (let i = 0; i < count; i++) {
      result += \`\${message}\n\`;
    }
    
    console.log(result.trim());
    process.exit(0);
  });
}
`;

  // Create temporary tools directory
  const tempToolsDir = path.join(process.cwd(), ".acai", "tools");
  if (!fs.existsSync(tempToolsDir)) {
    fs.mkdirSync(tempToolsDir, { recursive: true });
  }

  const testToolPath = path.join(tempToolsDir, "test-integration.js");
  fs.writeFileSync(testToolPath, testToolContent);
  fs.chmodSync(testToolPath, "755");

  try {
    // Test dynamic tool loading
    const tools = await loadDynamicTools({
      baseDir: process.cwd(),
    });

    // Verify tool was loaded
    assert.ok(tools["dynamic:test-integration"], "Test tool should be loaded");

    // Test tool execution
    const tool = tools["dynamic:test-integration"];
    const toolImpl = tool as unknown as {
      execute: (
        args: { message: string; count?: number },
        meta: { toolCallId: string },
      ) => Promise<string>;
    };

    // Test with required parameters
    const result1 = await toolImpl.execute(
      { message: "Hello World" },
      { toolCallId: "test-1" },
    );
    assert.equal(result1, "Hello World", "Should return the message");

    // Test with optional parameters
    const result2 = await toolImpl.execute(
      { message: "Repeat", count: 3 },
      { toolCallId: "test-2" },
    );
    assert.equal(
      result2,
      "Repeat\nRepeat\nRepeat",
      "Should repeat message 3 times",
    );

    // Test error handling - missing required parameter
    try {
      await toolImpl.execute({} as { message: string; count?: number }, {
        toolCallId: "test-3",
      });
      assert.fail("Should have thrown error for missing required parameter");
    } catch (error) {
      assert.ok(
        error instanceof Error && error.message.includes("Invalid parameters"),
        "Should throw validation error",
      );
    }
  } finally {
    // Clean up
    if (fs.existsSync(testToolPath)) {
      fs.unlinkSync(testToolPath);
    }
  }
});

test("Dynamic tool integration - run-tests tool", async () => {
  // Test that the existing run-tests tool can be loaded and executed
  const tools = await loadDynamicTools({
    baseDir: process.cwd(),
  });

  // Verify run-tests tool was loaded
  assert.ok(tools["dynamic:run-tests"], "Run-tests tool should be loaded");

  // Test tool execution with default parameters
  const tool = tools["dynamic:run-tests"];
  const toolImpl = tool as unknown as {
    execute: (
      args: { dir?: string },
      meta: { toolCallId: string },
    ) => Promise<string>;
  };

  // This will run npm test in the current directory
  const result = await toolImpl.execute(
    { dir: "." },
    { toolCallId: "test-run-tests" },
  );

  // The result should contain test output (we don't care about the exact content)
  assert.ok(
    typeof result === "string" && result.length > 0,
    "Should return test output",
  );
});
