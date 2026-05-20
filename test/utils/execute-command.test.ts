import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeCommand } from "../../source/utils/process.ts";

describe("executeCommand", () => {
  describe("successful execution", () => {
    it("executes a simple string command", async () => {
      const result = await executeCommand([
        "node",
        "-e",
        "console.log('hello')",
      ]);
      assert.equal(result.code, 0);
      assert.equal(result.stdout.trim(), "hello");
    });

    it("executes a command with multiple arguments", async () => {
      const result = await executeCommand([
        "node",
        "-e",
        "console.log('hello world')",
      ]);
      assert.equal(result.code, 0);
      assert.equal(result.stdout.trim(), "hello world");
    });

    it("executes an array command directly", async () => {
      const result = await executeCommand([
        "node",
        "-e",
        "console.log('hello')",
      ]);
      assert.equal(result.code, 0);
      assert.equal(result.stdout.trim(), "hello");
    });

    it("captures stderr output", async () => {
      const result = await executeCommand([
        "node",
        "-e",
        "console.error('err')",
      ]);
      assert.equal(result.code, 0);
      assert.equal(result.stderr.trim(), "err");
    });

    it("returns exit code 0 on success", async () => {
      const result = await executeCommand(["node", "-e", "process.exit(0)"]);
      assert.equal(result.code, 0);
    });
  });

  describe("command parsing errors", () => {
    it("returns error result for invalid command string with backticks", async () => {
      const result = await executeCommand("echo `whoami`");
      assert.equal(result.code, 1);
      assert.ok(result.stderr.length > 0);
    });

    it("rejects when throwOnError is true and parse fails", async () => {
      await assert.rejects(
        executeCommand("echo `whoami`", { throwOnError: true }),
      );
    });

    it("returns error for empty command string", async () => {
      const result = await executeCommand("");
      assert.equal(result.code, 1);
      assert.equal(result.stderr, "Empty command");
    });

    it("returns error for whitespace-only command", async () => {
      const result = await executeCommand("   ");
      assert.equal(result.code, 1);
      assert.ok(result.stderr.length > 0);
    });
  });

  describe("missing command", () => {
    it("returns error when array has no command", async () => {
      const result = await executeCommand(
        [] as unknown as [string, ...string[]],
      );
      assert.equal(result.code, 1);
      assert.equal(result.stderr, "Missing command");
    });

    it("rejects when throwOnError is true and command is missing", async () => {
      await assert.rejects(
        executeCommand([] as unknown as [string, ...string[]], {
          throwOnError: true,
        }),
      );
    });
  });

  describe("abort signal", () => {
    it("returns abort result when signal is already aborted", async () => {
      const ac = new AbortController();
      ac.abort();
      const result = await executeCommand(["node", "-e", "console.log('hi')"], {
        abortSignal: ac.signal,
      });
      assert.equal(result.code, 130);
      assert.equal(result.stderr, "Command execution aborted");
    });

    it("rejects when throwOnError is true and signal is already aborted", async () => {
      const ac = new AbortController();
      ac.abort();
      await assert.rejects(
        executeCommand(["node", "-e", "console.log('hi')"], {
          abortSignal: ac.signal,
          throwOnError: true,
        }),
      );
    });
  });

  describe("non-zero exit codes", () => {
    it("returns non-zero exit code from command", async () => {
      const result = await executeCommand(["node", "-e", "process.exit(42)"]);
      assert.equal(result.code, 42);
    });

    it("includes stderr on error when preserveOutputOnError is true (default)", async () => {
      const result = await executeCommand([
        "node",
        "-e",
        "console.error('err'); process.exit(1)",
      ]);
      assert.equal(result.code, 1);
      assert.ok(result.stderr.includes("err"));
    });

    it("includes stdout on error when preserveOutputOnError is true", async () => {
      const result = await executeCommand([
        "node",
        "-e",
        "console.log('out'); process.exit(1)",
      ]);
      assert.equal(result.code, 1);
      assert.ok(result.stdout.includes("out"));
    });

    it("strips output on error when preserveOutputOnError is false", async () => {
      const result = await executeCommand(
        [
          "node",
          "-e",
          "console.log('out'); console.error('err'); process.exit(1)",
        ],
        { preserveOutputOnError: false },
      );
      assert.equal(result.code, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "");
    });

    it("rejects when throwOnError is true and command fails", async () => {
      await assert.rejects(
        executeCommand(["node", "-e", "process.exit(1)"], {
          throwOnError: true,
        }),
      );
    });
  });

  describe("timeout", () => {
    it("kills command after timeout", async () => {
      const result = await executeCommand(
        ["node", "-e", "setTimeout(() => {}, 10000)"],
        {
          timeout: 200,
        },
      );
      assert.notEqual(result.code, 0);
    });
  });

  describe("custom working directory", () => {
    it("executes command in specified cwd", async () => {
      const result = await executeCommand(
        ["node", "-e", "console.log(process.cwd())"],
        { cwd: "/private/tmp" },
      );
      assert.equal(result.code, 0);
      assert.equal(result.stdout.trim(), "/private/tmp");
    });
  });

  describe("maxBuffer", () => {
    it("respects maxBuffer limit", async () => {
      const result = await executeCommand(
        ["node", "-e", "console.log('x'.repeat(100000))"],
        { maxBuffer: 1024 },
      );
      assert.notEqual(result.code, 0);
    });
  });

  describe("shell mode", () => {
    it("executes with shell when enabled", async () => {
      const result = await executeCommand("echo $HOME", { shell: true });
      assert.equal(result.code, 0);
      assert.ok(result.stdout.trim().length > 0);
    });
  });
});
