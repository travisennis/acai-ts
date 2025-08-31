import assert from "node:assert";
import { describe, it } from "node:test";
import { CommandValidation } from "../../source/tools/command-validation.ts";

describe("CommandValidation", () => {
  const allowedCommands = ["ls", "pwd", "echo", "grep", "sleep"];
  const validator = new CommandValidation(allowedCommands);

  describe("Valid Commands", () => {
    it("allows simple allowed command", () => {
      const result = validator.isValid("ls -la");
      assert.strictEqual(result.isValid, true);
    });

    it("allows quoted args", () => {
      const result = validator.isValid('echo "hello world"');
      assert.strictEqual(result.isValid, true);
    });
  });

  describe("Invalid Commands", () => {
    it("blocks chaining with &&", () => {
      const result = validator.isValid("ls && pwd");
      assert.strictEqual(result.isValid, false);
      assert.ok(result.error?.includes("disabled for security"));
    });

    it("blocks OR chaining ||", () => {
      const result = validator.isValid("echo 'hi' || ls");
      assert.strictEqual(result.isValid, false);
      assert.ok(result.error?.includes("disabled for security"));
    });

    it("blocks ; separators", () => {
      const result = validator.isValid("ls; pwd");
      assert.strictEqual(result.isValid, false);
      assert.ok(result.error?.includes("disabled for security"));
    });

    it("blocks pipes", () => {
      const result = validator.isValid("ls | grep .ts");
      assert.strictEqual(result.isValid, false);
      assert.ok(result.error?.includes("disabled for security"));
    });

    it("blocks backgrounding with &", () => {
      const result = validator.isValid("sleep 1 &");
      assert.strictEqual(result.isValid, false);
      assert.ok(result.error?.includes("disabled for security"));
    });

    it("blocks redirects", () => {
      const result = validator.isValid("ls > file");
      assert.strictEqual(result.isValid, false);
      assert.ok(result.error?.includes("disabled for security"));
    });

    it("blocks echo $(date) (unsafe operator)", () => {
      const result = validator.isValid("echo $(date)");
      assert.strictEqual(result.isValid, false);
      assert.ok(result.error?.includes("disabled for security"));
    });

    it("blocks disallowed command", () => {
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
