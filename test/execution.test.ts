import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ExecutionEnvironment } from "../source/execution/index.ts";

describe("test executeCommand", () => {
  test("executeCommand returns stdout and exitCode 0 for echo", async () => {
    const env = new ExecutionEnvironment();
    const result = await env.executeCommand("echo -n hello");

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.output, "hello");
    assert.strictEqual(result.command, "echo -n hello");
  });

  test("executeCommand returns non-zero exitCode for failing command", async () => {
    const env = new ExecutionEnvironment();
    const result = await env.executeCommand('node -e "process.exit(3)"');

    assert.strictEqual(result.exitCode, 3);
    assert.ok(result.error instanceof Error);
  });
});

describe("test allowedCommands", () => {
  test("allowedCommands string pattern permits matching commands and blocks others", async () => {
    const env = new ExecutionEnvironment({
      execution: {
        allowedCommands: ["echo"],
      },
    });

    const ok = await env.executeCommand("echo allowed");
    assert.strictEqual(ok.exitCode, 0);

    await assert.rejects(async () => {
      await env.executeCommand("ls -la");
    }, /not in the allowed list/);
  });

  test("allowedCommands RegExp permits matching commands", async () => {
    const env = new ExecutionEnvironment({
      execution: {
        allowedCommands: [/^node/],
      },
    });

    const ok = await env.executeCommand("node -e \"console.log('x')\"");
    assert.strictEqual(ok.exitCode, 0);

    await assert.rejects(async () => {
      await env.executeCommand("echo nope");
    }, /not in the allowed list/);
  });
});

describe("test validateCommand", () => {
  test("validateCommand rejects for dangerous commands", async () => {
    const env = new ExecutionEnvironment();
    assert.throws(() => {
      env.validateCommand("rm -rf /");
    }, /blocked|dangerous/);
  });
});

// Background process test: listen for outputs and exit
// test("executeCommandInBackground runs process and calls callbacks", async () => {
//   const env = new ExecutionEnvironment();

//   const outputs: string[] = [];
//   const errors: string[] = [];

//   const bg = env.executeCommandInBackground(
//     "node -e \"console.log('bg-start'); setTimeout(()=>console.log('bg-end'), 300)\"",
//     {
//       onOutput: (o) => outputs.push(o.trim()),
//       onError: (e) => errors.push(e.trim()),
//     },
//   );

//   assert.strictEqual(typeof bg.pid, "number");
//   assert.strictEqual(typeof bg.kill, "function");

//   // Wait for the background process to exit (poll for up to 3s)
//   const start = Date.now();
//   while (Date.now() - start < 3000) {
//     if (outputs.some((s) => s.includes("bg-end"))) break;
//     await new Promise((r) => setTimeout(r, 50));
//   }

//   // We should have seen both outputs
//   assert.ok(
//     outputs.some((s) => s.includes("bg-start")),
//     `expected bg-start in outputs: ${JSON.stringify(outputs)}`,
//   );
//   assert.ok(
//     outputs.some((s) => s.includes("bg-end")),
//     `expected bg-end in outputs: ${JSON.stringify(outputs)}`,
//   );
// });

describe("test captureStderr option", () => {
  test("executeCommand captures stderr when captureStderr is true", async () => {
    const env = new ExecutionEnvironment();
    const result = await env.executeCommand(
      "echo stdout; echo stderr >&2",
      { captureStderr: true },
    );

    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.output.includes("stdout"));
    assert.ok(result.output.includes("stderr"));
  });

  test("executeCommand does not capture stderr when captureStderr is false", async () => {
    const env = new ExecutionEnvironment();
    const result = await env.executeCommand(
      "echo stdout; echo stderr >&2",
      { captureStderr: false },
    );

    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.output.includes("stdout"));
    assert.ok(!result.output.includes("stderr"));
  });
});

describe("test preserveOutputOnError option", () => {
  test("executeCommand preserves output on error when preserveOutputOnError is true", async () => {
    const env = new ExecutionEnvironment();
    const result = await env.executeCommand(
      "echo error_output; exit 1",
      { preserveOutputOnError: true },
    );

    assert.strictEqual(result.exitCode, 1);
    assert.ok(result.output.includes("error_output"));
  });

  test("executeCommand clears output on error when preserveOutputOnError is false", async () => {
    const env = new ExecutionEnvironment();
    const result = await env.executeCommand(
      "echo error_output; exit 1",
      { preserveOutputOnError: false },
    );

    assert.strictEqual(result.exitCode, 1);
    assert.strictEqual(result.output, "");
  });
});

describe("test throwOnError option", () => {
  test("executeCommand throws when throwOnError is true and command fails", async () => {
    const env = new ExecutionEnvironment();
    await assert.rejects(
      async () => {
        await env.executeCommand("exit 1", { throwOnError: true });
      },
      (error: Error) => {
        assert.ok(error instanceof Error);
        return true;
      },
    );
  });

  test("executeCommand does not throw when throwOnError is false and command fails", async () => {
    const env = new ExecutionEnvironment();
    const result = await env.executeCommand("exit 1", { throwOnError: false });

    assert.strictEqual(result.exitCode, 1);
  });
});
