import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  CombinedAutocompleteProvider,
  type SlashCommand,
} from "../../source/tui/autocomplete.ts";

describe("CombinedAutocompleteProvider", () => {
  let provider: CombinedAutocompleteProvider;

  const testCommands: SlashCommand[] = [
    { name: "help", description: "Show help" },
    { name: "history", description: "Show command history" },
    { name: "add-directory", description: "Add directory to context" },
    { name: "hello", description: "Say hello" },
  ];

  beforeEach(() => {
    provider = new CombinedAutocompleteProvider(testCommands);
  });

  describe("slash command autocomplete", () => {
    it("should show all commands when typing /", async () => {
      const result = await provider.getSuggestions(["/"], 0, 1);
      assert.ok(result);
      assert.strictEqual(result.prefix, "");
      assert.strictEqual(result.items.length, 4);
      assert.deepStrictEqual(
        result.items.map((i) => i.value).sort(),
        ["help", "history", "add-directory", "hello"].sort(),
      );
    });

    it("should filter commands by prefix", async () => {
      const result = await provider.getSuggestions(["/h"], 0, 2);
      assert.ok(result);
      assert.strictEqual(result.prefix, "h");
      assert.strictEqual(result.items.length, 3);
      assert.deepStrictEqual(
        result.items.map((i) => i.value).sort(),
        ["help", "history", "hello"].sort(),
      );
    });

    it("should filter commands by longer prefix", async () => {
      const result = await provider.getSuggestions(["/hi"], 0, 3);
      assert.ok(result);
      assert.strictEqual(result.prefix, "hi");
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.items[0].value, "history");
    });

    it("should handle case-insensitive matching", async () => {
      const result = await provider.getSuggestions(["/H"], 0, 2);
      assert.ok(result);
      assert.strictEqual(result.prefix, "H");
      assert.strictEqual(result.items.length, 3);
      assert.deepStrictEqual(
        result.items.map((i) => i.value).sort(),
        ["help", "history", "hello"].sort(),
      );
    });

    it("should return null when no commands match", async () => {
      const result = await provider.getSuggestions(["/xyz"], 0, 4);
      assert.strictEqual(result, null);
    });

    it("should handle command arguments", async () => {
      const commandWithArgs: SlashCommand = {
        name: "test",
        description: "Test command",
        getArgumentCompletions: (_prefix: string) => [
          { value: "arg1", label: "Argument 1" },
          { value: "arg2", label: "Argument 2" },
        ],
      };

      const providerWithArgs = new CombinedAutocompleteProvider([
        commandWithArgs,
      ]);
      const result = await providerWithArgs.getSuggestions(["/test a"], 0, 7);
      assert.ok(result);
      assert.strictEqual(result.prefix, "a");
      assert.strictEqual(result.items.length, 2);
    });
  });

  describe("file path autocomplete", () => {
    it("should trigger for @ prefix", async () => {
      const result = await provider.getSuggestions(["@"], 0, 1);
      assert.ok(result);
      assert.strictEqual(result.prefix, "@");
      assert.equal(
        !!result.items.find((value) => value.label === "source"),
        true,
      );
      // Should return file suggestions (even if empty)
    });

    it("should trigger for @ with partial path", async () => {
      const result = await provider.getSuggestions(["@source"], 0, 7);
      assert.ok(result);
      assert.strictEqual(result.prefix, "@source");
      assert.equal(
        !!result.items.find((value) => value.label === "source"),
        true,
      );
    });

    it("should trigger for @ with path containing slash", async () => {
      const result = await provider.getSuggestions(["@source/to"], 0, 10);
      assert.ok(result);
      assert.strictEqual(result.prefix, "@source/to");
      assert.equal(
        !!result.items.find((value) => value.label === "tools"),
        true,
      );
    });

    it("should trigger for paths starting with ./", async () => {
      const result = await provider.getSuggestions(["./"], 0, 2);
      assert.ok(result);
      assert.strictEqual(result.prefix, "./");
      assert.equal(
        !!result.items.find((value) => value.label === "source"),
        true,
      );
    });

    it("shouldn't trigger for paths starting with ~/", async () => {
      const result = await provider.getSuggestions(["~/"], 0, 2);
      assert.strictEqual(result, null);
    });

    it("should trigger for paths ending with /", async () => {
      // Use a path that should exist (current directory)
      const result = await provider.getSuggestions(["./source/"], 0, 9);
      assert.ok(result);
    });
  });

  describe("force file completion", () => {
    it("should trigger for @ prefix with Tab", async () => {
      const result = await provider.getForceFileSuggestions(
        ["@source/to"],
        0,
        10,
      );
      assert.ok(result);
      assert.strictEqual(result.prefix, "@source/to");
      assert.equal(
        !!result.items.find((value) => value.label === "tools"),
        true,
      );
    });

    it("should trigger for partial paths with Tab", async () => {
      const result = await provider.getForceFileSuggestions(["source"], 0, 6);
      assert.ok(result);
      assert.strictEqual(result.prefix, "source");
      assert.equal(
        !!result.items.find((value) => value.label === "source"),
        true,
      );
    });

    it("should not trigger for slash commands with Tab", async () => {
      const result = await provider.getForceFileSuggestions(["/h"], 0, 2);
      assert.strictEqual(result, null);
    });

    it("should trigger for slash commands with arguments", async () => {
      const result = await provider.getForceFileSuggestions(
        ["/help source"],
        0,
        12,
      );
      assert.ok(result);
      assert.strictEqual(result.prefix, "source");
    });
  });

  describe("applyCompletion", () => {
    it("should apply slash command completion correctly", () => {
      const result = provider.applyCompletion(
        ["/h"],
        0,
        2,
        { value: "help", label: "help" },
        "h",
      );

      assert.deepStrictEqual(result.lines, ["/help "]);
      assert.strictEqual(result.cursorLine, 0);
      assert.strictEqual(result.cursorCol, 6); // After "/help "
    });

    it("should apply @ file completion correctly", () => {
      const result = provider.applyCompletion(
        ["@source"],
        0,
        7,
        { value: "@source/to", label: "to" },
        "@source",
      );

      assert.deepStrictEqual(result.lines, ["@source/to "]);
      assert.strictEqual(result.cursorLine, 0);
      assert.strictEqual(result.cursorCol, 11); // After "@source/to "
    });

    it("should apply regular file completion correctly", () => {
      const result = provider.applyCompletion(
        ["source"],
        0,
        6,
        { value: "source/to", label: "to" },
        "source",
      );

      assert.deepStrictEqual(result.lines, ["source/to"]);
      assert.strictEqual(result.cursorLine, 0);
      assert.strictEqual(result.cursorCol, 9); // After "source/to"
    });

    it("should apply command argument completion correctly", () => {
      const result = provider.applyCompletion(
        ["/help sour"],
        0,
        10,
        { value: "source", label: "source" },
        "sour",
      );

      assert.deepStrictEqual(result.lines, ["/help source"]);
      assert.strictEqual(result.cursorLine, 0);
      assert.strictEqual(result.cursorCol, 12); // After "/help source"
    });
  });

  describe("extractPathPrefix", () => {
    it("should extract @ prefixes", () => {
      // @ts-expect-error - accessing private method for testing
      const result = provider.extractPathPrefix("@source/to", false);
      assert.strictEqual(result, "@source/to");
    });

    it("should extract @ prefixes with force extraction", () => {
      // @ts-expect-error - accessing private method for testing
      const result = provider.extractPathPrefix("@source/to", true);
      assert.strictEqual(result, "@source/to");
    });

    it("should extract regular paths", () => {
      // @ts-expect-error - accessing private method for testing
      const result = provider.extractPathPrefix("source/to", false);
      assert.strictEqual(result, "source/to");
    });

    it("should extract paths with ./ prefix", () => {
      // @ts-expect-error - accessing private method for testing
      const result = provider.extractPathPrefix("./source", false);
      assert.strictEqual(result, "./source");
    });

    it("should extract paths with ~/ prefix", () => {
      // @ts-expect-error - accessing private method for testing
      const result = provider.extractPathPrefix("~/Documents", false);
      assert.strictEqual(result, "~/Documents");
    });

    it("should return null for non-path text", () => {
      // @ts-expect-error - accessing private method for testing
      const result = provider.extractPathPrefix("some random text", false);
      assert.strictEqual(result, null);
    });

    it("should return the last word for force extraction with no clear path context", () => {
      // @ts-expect-error - accessing private method for testing
      const result = provider.extractPathPrefix("some text", true);
      // When we have "some text" and press Tab, we should complete files starting with "text"
      assert.strictEqual(result, "text");
    });
  });
});
