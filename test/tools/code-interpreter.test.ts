import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { after, describe, it } from "node:test";
import { createCodeInterpreterTool } from "../../source/tools/code-interpreter.ts";

// Helper to run the tool easily
async function runTool(input: {
  code: string;
  timeoutSeconds?: number | null;
}): Promise<{ ok: boolean; value: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  const { execute } = await createCodeInterpreterTool();

  const generator = execute(
    { ...input, timeoutSeconds: input.timeoutSeconds ?? null },
    { toolCallId: "t1", abortSignal: undefined, messages: [] },
  );

  let output = "";

  // Iterate through the generator and capture all values
  while (true) {
    const result = await generator.next();
    if (result.done) {
      break;
    }
    // This is a yielded message or result
    if (typeof result.value === "string") {
      // This is the final result (yielded instead of returned)
      output = result.value;
    } else if (
      typeof result.value === "object" &&
      "event" in result.value &&
      "data" in result.value
    ) {
      events.push({ event: result.value.event, data: result.value.data });
    }
  }

  if (typeof output === "string" && output.startsWith("{")) {
    return { ok: true, value: JSON.parse(output) };
  }
  // Handle case where output contains JSON but also other content
  try {
    const parsed = JSON.parse(output);
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, value: output };
  }
}

describe("code-interpreter tool", () => {
  it("executes simple console.log", async () => {
    const res = await runTool({
      code: "console.log('ok');",
    });
    assert.equal(res.ok, true);
    const v = res.value as { stdout: string; stderr: string; exitCode: number };
    assert.equal(v.exitCode, 0);
    assert.equal(v.stdout.trim(), "ok");
    // Ignore stderr in this test due to environment-specific Node warnings.
    assert.equal(typeof v.stderr, "string");
  });

  it("enforces timeout", async () => {
    const res = await runTool({
      code: "for(;;){}",
      timeoutSeconds: 1,
    });
    assert.equal(res.ok, false);
    assert.equal(res.value, "Script timed out");
  });

  it("allows fs within cwd", async () => {
    const code = `
      import { writeFileSync, readFileSync, rmSync } from 'node:fs';
      writeFileSync('tmp_test_file.txt', 'hello', { encoding: 'utf8' });
      const s = readFileSync('tmp_test_file.txt', { encoding: 'utf8' });
      console.log(s);
      rmSync('tmp_test_file.txt', { force: true });
    `;
    const res = await runTool({ code });
    assert.equal(res.ok, true);
    const v = res.value as { stdout: string };
    assert.equal(v.stdout.trim(), "hello");
  });

  it("denies fs outside cwd", async () => {
    const code = `
      import { writeFileSync } from 'node:fs';
      import { resolve } from 'node:path';
      writeFileSync(resolve('..', 'should_not_write.txt'), 'x', { encoding: 'utf8' });
      console.log('done');
    `;
    const res = await runTool({ code });
    assert.equal(res.ok, false);
    assert.match(String(res.value), /Process exited with code|permission/i);
  });

  it("denies child_process", async () => {
    const code = `
      import { spawnSync } from 'node:child_process';
      const r = spawnSync('node', ['-v']);
      console.log(String(r.stdout || ''));
    `;
    const res = await runTool({ code });
    assert.equal(res.ok, false);
  });

  // it("denies network", async () => {
  //   const code = `
  //     import https from 'node:https';
  //     https.get('https://example.com', (res) => { console.log('status', res.statusCode); }).on('error', (e) => { console.error(String(e)); });
  //   `;
  //   const res = await runTool({ code });
  //   // Note: Network access is not restricted by Node.js Permission Model in v24.3.0
  //   // The test currently passes due to timeout behavior, but this may change in future Node.js versions
  //   assert.equal(res.ok, false);
  // });

  describe("TypeScript support", () => {
    it("executes TypeScript code with .ts extension", async () => {
      const res = await runTool({
        code: "console.log('TypeScript executed with .ts extension');",
      });
      assert.equal(res.ok, true);
      const v = res.value as {
        stdout: string;
        stderr: string;
        exitCode: number;
      };
      assert.equal(v.exitCode, 0);
      assert.equal(v.stdout.trim(), "TypeScript executed with .ts extension");
    });

    it("can import code that uses logger without permission errors", async () => {
      const res = await runTool({
        code: `
          import { logger } from '../source/logger.ts';
          logger.info('Test log message from code interpreter');
          console.log('Logger imported successfully');
        `,
      });
      assert.equal(res.ok, true);
      const v = res.value as {
        stdout: string;
        stderr: string;
        exitCode: number;
      };
      assert.equal(v.exitCode, 0);
      // The stdout should contain both the logger output and our success message
      assert.match(v.stdout, /Logger imported successfully/);
      // Should not contain permission errors
      assert.doesNotMatch(v.stderr, /permission|ERR_ACCESS_DENIED/i);
    });

    it("supports TypeScript interfaces and types", async () => {
      const res = await runTool({
        code: `
          interface User { name: string; age: number; }
          const user: User = { name: "Alice", age: 30 };
          console.log(user.name);
        `,
      });
      assert.equal(res.ok, true);
      const v = res.value as {
        stdout: string;
        stderr: string;
        exitCode: number;
      };
      assert.equal(v.exitCode, 0);
      assert.equal(v.stdout.trim(), "Alice");
    });

    it("supports TypeScript generics", async () => {
      const res = await runTool({
        code: `
          function identity<T>(arg: T): T {
            return arg;
          }
          console.log(identity<string>("hello"));
        `,
      });
      assert.equal(res.ok, true);
      const v = res.value as {
        stdout: string;
        stderr: string;
        exitCode: number;
      };
      assert.equal(v.exitCode, 0);
      assert.equal(v.stdout.trim(), "hello");
    });
  });

  // Clean up any test files that might have been created
  after(() => {
    const testFiles = ["ts_test.txt", "tmp_test_file.txt"];
    testFiles.forEach((file) => {
      if (existsSync(file)) {
        rmSync(file, { force: true });
      }
    });
  });
});
