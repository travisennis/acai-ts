import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type EditorPromptOptions,
  editor,
} from "../../source/terminal/editor-prompt.ts";

describe("editor prompt", () => {
  it("should export the editor function", () => {
    assert.strictEqual(typeof editor, "function");
  });

  it("should have correct types", () => {
    const options: EditorPromptOptions = {
      message: "Test message",
      default: "default content",
      postfix: ".ts",
      editor: "vim",
      skipPrompt: false,
    };

    assert.strictEqual(options.message, "Test message");
    assert.strictEqual(options.default, "default content");
    assert.strictEqual(options.postfix, ".ts");
    assert.strictEqual(options.editor, "vim");
    assert.strictEqual(options.skipPrompt, false);
  });

  it("should support skipPrompt option", () => {
    const optionsWithSkipPrompt: EditorPromptOptions = {
      message: "Test message",
      skipPrompt: true,
    };

    const optionsWithoutSkipPrompt: EditorPromptOptions = {
      message: "Test message",
      skipPrompt: false,
    };

    const optionsDefault: EditorPromptOptions = {
      message: "Test message",
    };

    assert.strictEqual(optionsWithSkipPrompt.skipPrompt, true);
    assert.strictEqual(optionsWithoutSkipPrompt.skipPrompt, false);
    assert.strictEqual(optionsDefault.skipPrompt, undefined);
  });
});
