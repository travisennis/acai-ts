import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseArgv } from "../../source/utils/process.ts";

describe("parseArgv", () => {
  // --- successful cases ---

  it("parses simple command", () => {
    const res = parseArgv("echo hi");
    assert.deepEqual(res, { ok: true, argv: ["echo", "hi"] });
  });

  it("parses single argument", () => {
    const res = parseArgv("ls");
    assert.deepEqual(res, { ok: true, argv: ["ls"] });
  });

  it("handles multiple spaces between arguments", () => {
    const res = parseArgv("echo   hi   there");
    assert.deepEqual(res, { ok: true, argv: ["echo", "hi", "there"] });
  });

  it("handles leading whitespace", () => {
    const res = parseArgv("  echo hi");
    assert.deepEqual(res, { ok: true, argv: ["echo", "hi"] });
  });

  it("handles trailing whitespace", () => {
    const res = parseArgv("echo hi  ");
    assert.deepEqual(res, { ok: true, argv: ["echo", "hi"] });
  });

  it("handles tab characters as whitespace", () => {
    const res = parseArgv("echo\thi");
    assert.deepEqual(res, { ok: true, argv: ["echo", "hi"] });
  });

  it("preserves spaces in double quotes", () => {
    const res = parseArgv('echo "a b"');
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.argv, ["echo", "a b"]);
    }
  });

  it("preserves spaces in single quotes", () => {
    const res = parseArgv("echo 'a b'");
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.argv, ["echo", "a b"]);
    }
  });

  it("handles escapes outside quotes", () => {
    const res = parseArgv("echo a\\ b");
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.argv, ["echo", "a b"]);
    }
  });

  it("handles escaped backslash outside quotes", () => {
    const res = parseArgv("echo a\\\\b");
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.argv, ["echo", "a\\b"]);
    }
  });

  it("preserves backslash inside double quotes for non-special chars", () => {
    const res = parseArgv('echo "a\\b"');
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.argv, ["echo", "a\\b"]);
    }
  });

  it("escapes backslash inside double quotes", () => {
    const res = parseArgv('echo "a\\\\b"');
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.argv, ["echo", "a\\b"]);
    }
  });

  it("escapes double quote inside double quotes", () => {
    const res = parseArgv('echo "a\\"b"');
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.argv, ["echo", 'a"b']);
    }
  });

  it("preserves single quotes inside double quotes", () => {
    const res = parseArgv("echo \"a'b\"");
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.argv, ["echo", "a'b"]);
    }
  });

  it("preserves double quotes inside single quotes", () => {
    const res = parseArgv('echo \'a"b\'');
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.argv, ["echo", 'a"b']);
    }
  });

  it("skips empty argument in double quotes (current behavior)", () => {
    const res = parseArgv('echo ""');
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.argv, ["echo"]);
    }
  });

  it("parses multiple arguments with mixed quoting", () => {
    const res = parseArgv("cmd 'single' \"double\" normal");
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.argv, ["cmd", "single", "double", "normal"]);
    }
  });

  // --- error cases ---

  it("rejects backticks", () => {
    const res = parseArgv("echo `whoami`");
    assert.equal(res.ok, false);
  });

  it("rejects $()", () => {
    const res = parseArgv("echo $(date)");
    assert.equal(res.ok, false);
  });

  it("rejects unterminated single quote", () => {
    const res = parseArgv("echo 'oops");
    assert.equal(res.ok, false);
  });

  it("rejects unterminated double quote", () => {
    const res = parseArgv('echo "oops');
    assert.equal(res.ok, false);
  });

  it("rejects dangling escape", () => {
    const res = parseArgv("echo foo\\");
    assert.equal(res.ok, false);
  });

  it("rejects empty string", () => {
    const res = parseArgv("");
    assert.equal(res.ok, false);
  });

  it("rejects whitespace-only string", () => {
    const res = parseArgv("   ");
    assert.equal(res.ok, false);
  });

  it("rejects command with only empty quoted strings", () => {
    const res = parseArgv('""');
    assert.equal(res.ok, false);
  });

  it("rejects command with only whitespace in quotes", () => {
    const res = parseArgv('"   "');
    assert.equal(res.ok, false);
  });
});
