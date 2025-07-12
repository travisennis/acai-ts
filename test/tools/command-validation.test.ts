import assert from "node:assert";
import { describe, it } from "node:test";
import { CommandValidation } from "../../source/tools/command-validation.ts";

describe("CommandValidation", () => {
  const allowedCommands = ["ls", "pwd", "echo", "grep", "sleep"];
  const validator = new CommandValidation(allowedCommands);

  describe("Valid Commands", () => {
    it("allows ls && pwd", () => {
      assert.strictEqual(validator.isValid("ls && pwd"), true);
    });

    it("allows echo 'hi' || ls", () => {
      assert.strictEqual(validator.isValid("echo 'hi' || ls"), true);
    });

    it("allows ls; pwd", () => {
      assert.strictEqual(validator.isValid("ls; pwd"), true);
    });

    it("allows ls | grep .ts", () => {
      assert.strictEqual(validator.isValid("ls | grep .ts"), true);
    });

    it("allows sleep 1 &", () => {
      assert.strictEqual(validator.isValid("sleep 1 &"), true);
    });
  });

  describe("Invalid Commands", () => {
    it("blocks ls > file (unsafe operator)", () => {
      assert.strictEqual(validator.isValid("ls > file"), false);
    });

    it("blocks echo $(date) (unsafe operator)", () => {
      assert.strictEqual(validator.isValid("echo $(date)"), false);
    });

    it("blocks rm -rf / (disallowed command)", () => {
      assert.strictEqual(validator.isValid("rm -rf /"), false);
    });

    it("blocks empty command", () => {
      assert.strictEqual(validator.isValid(""), false);
    });
  });
});
