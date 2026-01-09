import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  formatRulesForStorage,
  hideRuleSelector,
  parseRulesText,
} from "../../source/commands/generate-rules/utils.ts";
import {
  createMockContainer,
  createMockEditor,
  createMockTui,
} from "../utils/mocking.ts";

describe("generateRulesUtils", () => {
  describe("hideRuleSelector", () => {
    it("should clear container and add editor back", () => {
      const container = createMockContainer();
      const editor = createMockEditor();
      const tui = createMockTui();

      hideRuleSelector(container, editor, tui);

      assert.strictEqual(container.clear.mock.calls.length, 1);
      assert.strictEqual(container.addChild.mock.calls.length, 1);
    });
  });

  describe("parseRulesText", () => {
    it("should return empty array for empty string", () => {
      const result = parseRulesText("");
      assert.deepStrictEqual(result, []);
    });

    it("should return empty array for whitespace only", () => {
      const result = parseRulesText("   \n   \n  ");
      assert.deepStrictEqual(result, []);
    });

    it("should parse single rule", () => {
      const result = parseRulesText("- Always test your code");
      assert.deepStrictEqual(result, ["- Always test your code"]);
    });

    it("should parse multiple rules", () => {
      const input = `- Always test your code
- Never use any
- Always validate input`;
      const result = parseRulesText(input);
      assert.strictEqual(result.length, 3);
    });

    it("should trim whitespace from rules", () => {
      const input = `  - Always test your code  
  - Never use any  `;
      const result = parseRulesText(input);
      assert.strictEqual(result[0], "- Always test your code");
      assert.strictEqual(result[1], "- Never use any");
    });
  });

  describe("formatRulesForStorage", () => {
    it("should return existing rules if no new rules", () => {
      const result = formatRulesForStorage("existing", []);
      assert.strictEqual(result, "existing");
    });

    it("should append rules without extra newline if existing ends with newline", () => {
      const result = formatRulesForStorage("existing\n", ["new rule"]);
      assert.strictEqual(result, "existing\nnew rule");
    });

    it("should append rules with newline if existing does not end with newline", () => {
      const result = formatRulesForStorage("existing", ["new rule"]);
      assert.strictEqual(result, "existing\nnew rule");
    });

    it("should handle empty existing rules", () => {
      const result = formatRulesForStorage("", ["new rule"]);
      assert.strictEqual(result, "new rule");
    });

    it("should append multiple rules", () => {
      const result = formatRulesForStorage("existing", [
        "rule1",
        "rule2",
        "rule3",
      ]);
      assert.strictEqual(result, "existing\nrule1\nrule2\nrule3");
    });
  });
});
