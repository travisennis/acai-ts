import assert from "node:assert";
import { describe, it } from "node:test";
import { CommandValidation } from "../../source/tools/command-validation.ts";

describe("CommandValidation", () => {
  const allowedCommands = ["ls", "pwd", "echo", "grep", "sleep"];
  const validator = new CommandValidation(allowedCommands);

  describe("Valid Commands", () => {
    it("allows ls && pwd", () => {
      const result = validator.isValid("ls && pwd");
      assert.strictEqual(result.isValid, true);
    });

    it("allows echo 'hi' || ls", () => {
      const result = validator.isValid("echo 'hi' || ls");
      assert.strictEqual(result.isValid, true);
    });

    it("allows ls; pwd", () => {
      const result = validator.isValid("ls; pwd");
      assert.strictEqual(result.isValid, true);
    });

    it("allows ls | grep .ts", () => {
      const result = validator.isValid("ls | grep .ts");
      assert.strictEqual(result.isValid, true);
    });

    it("allows sleep 1 &", () => {
      const result = validator.isValid("sleep 1 &");
      assert.strictEqual(result.isValid, true);
    });
  });

  describe("Invalid Commands", () => {
    it("allows ls > file (redirects are now permitted)", () => {
      const result = validator.isValid("ls > file");
      assert.strictEqual(result.isValid, true);
    });

    it("blocks echo $(date) (unsafe operator)", () => {
      const result = validator.isValid("echo $(date)");
      assert.strictEqual(result.isValid, false);
      assert.ok(result.error?.includes("dangerous patterns"));
    });

    it("blocks rm -rf / (disallowed command)", () => {
      const result = validator.isValid("rm -rf /");
      assert.strictEqual(result.isValid, false);
      assert.ok(result.error?.includes("not allowed"));
    });

    it("blocks empty command", () => {
      const result = validator.isValid("");
      assert.strictEqual(result.isValid, false);
      assert.ok(result.error?.includes("cannot be empty"));
    });
  });
});
