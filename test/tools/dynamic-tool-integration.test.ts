import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { loadDynamicTools } from "../../source/tools/dynamic-tool-loader.ts";
import { createTempDir } from "../utils/test-fixtures.ts";

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

  // Create temporary base directory with .acai/tools structure
  const { path: tempBaseDir, cleanup: cleanupTools } = await createTempDir(
    "dynamic-tool-integration",
    "base",
  );
  const tempToolsDir = path.join(tempBaseDir, ".acai", "tools");
  await fs.promises.mkdir(tempToolsDir, { recursive: true });
  const testToolPath = path.join(tempToolsDir, "test-integration.js");
  fs.writeFileSync(testToolPath, testToolContent);
  fs.chmodSync(testToolPath, "755");

  try {
    // Test dynamic tool loading
    const tools = await loadDynamicTools({
      baseDir: tempBaseDir,
    });

    // Verify tool was loaded
    assert.ok(tools["dynamic-test-integration"], "Test tool should be loaded");

    // Test tool execution
    const tool = tools["dynamic-test-integration"];
    const toolImpl = tool as unknown as {
      execute: (
        args: { message: string; count?: number },
        meta: { toolCallId: string; abortSignal?: AbortSignal },
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
    await assert.rejects(
      async () =>
        await toolImpl.execute({} as { message: string; count?: number }, {
          toolCallId: "test-3",
        }),
      /Invalid parameters/,
    );
  } finally {
    // Clean up
    await cleanupTools();
  }
});

test("Dynamic tool integration - needsApproval functionality", async () => {
  // Create a temporary test tool that doesn't need approval
  const testToolContent = `#!/usr/bin/env node

import { spawn } from 'node:child_process';

if (process.env.TOOL_ACTION === 'describe') {
  console.log(JSON.stringify({
    name: 'test-no-approval',
    description: 'Test tool that does not need approval',
    parameters: [
      {
        name: 'message',
        type: 'string',
        description: 'Message to echo back',
        required: true
      }
    ],
    needsApproval: false
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
    console.log(message);
    process.exit(0);
  });
}
`;

  // Create temporary base directory with .acai/tools structure
  const { path: tempBaseDir, cleanup: cleanupTools } = await createTempDir(
    "dynamic-tool-integration",
    "base2",
  );
  const tempToolsDir = path.join(tempBaseDir, ".acai", "tools");
  await fs.promises.mkdir(tempToolsDir, { recursive: true });
  const testToolPath = path.join(tempToolsDir, "test-no-approval.js");
  fs.writeFileSync(testToolPath, testToolContent);
  fs.chmodSync(testToolPath, "755");

  try {
    // Test dynamic tool loading
    const tools = await loadDynamicTools({
      baseDir: tempBaseDir,
    });

    // Verify tool was loaded
    assert.ok(tools["dynamic-test-no-approval"], "Test tool should be loaded");

    // Test tool execution
    const tool = tools["dynamic-test-no-approval"];
    const toolImpl = tool as unknown as {
      execute: (
        args: { message: string },
        meta: { toolCallId: string; abortSignal?: AbortSignal },
      ) => Promise<string>;
    };

    // Test tool execution works
    const result = await toolImpl.execute(
      { message: "Auto-approved" },
      { toolCallId: "test-execution" },
    );
    assert.equal(result, "Auto-approved", "Should execute normally");
  } finally {
    // Clean up
    await cleanupTools();
  }
});

test("Dynamic tool integration - run-all-checks tool", async () => {
  // Test that the existing run-all-checks tool can be loaded and executed
  const tools = await loadDynamicTools({
    baseDir: process.cwd(),
  });

  // Verify run-all-checks tool was loaded
  assert.ok(
    tools["dynamic-run-all-checks"],
    "Run-all-checks tool should be loaded",
  );

  // Test tool execution with default parameters
  const tool = tools["dynamic-run-all-checks"];
  const toolImpl = tool as unknown as {
    execute: (
      args: { dir?: string },
      meta: { toolCallId: string; abortSignal?: AbortSignal },
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
