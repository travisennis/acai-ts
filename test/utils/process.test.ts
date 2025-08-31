import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseArgv } from "../../source/utils/process.ts";

describe("parseArgv", () => {
  it("parses simple command", () => {
    const res = parseArgv("echo hi");
    assert.deepEqual(res, { ok: true, argv: ["echo", "hi"] });
  });

  it("preserves spaces in double quotes", () => {
    const res = parseArgv('echo "a b"');
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.argv, ["echo", "a b"]);
    }
  });

  it("preserves spaces in single quotes (content only)", () => {
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

  it("rejects backticks", () => {
    const res = parseArgv("echo `whoami`");
    assert.equal(res.ok, false);
  });

  it("rejects $()", () => {
    const res = parseArgv("echo $(date)");
    assert.equal(res.ok, false);
  });

  it("rejects unterminated quotes", () => {
    const res = parseArgv("echo 'oops");
    assert.equal(res.ok, false);
  });

  it("rejects dangling escape", () => {
    const res = parseArgv("echo foo\\");
    assert.equal(res.ok, false);
  });
});
