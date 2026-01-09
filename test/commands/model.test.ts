import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { hideModelSelector } from "../../source/commands/model/utils.ts";

describe("model/utils.ts", () => {
  describe("hideModelSelector", () => {
    it("should clear editor container and re-add editor", () => {
      let clearCalled = false;
      let addChildCalled = false;
      let focusCalled = false;

      const mockEditor = {
        setText: () => {},
      };

      const mockEditorContainer = {
        clear: () => {
          clearCalled = true;
        },
        addChild: (_child: unknown) => {
          addChildCalled = true;
        },
      };

      const mockTui = {
        setFocus: (_component: unknown) => {
          focusCalled = true;
        },
      };

      hideModelSelector(
        mockEditorContainer as never,
        mockEditor as never,
        mockTui as never,
      );

      assert.strictEqual(clearCalled, true);
      assert.strictEqual(addChildCalled, true);
      assert.strictEqual(focusCalled, true);
    });

    it("should handle multiple calls correctly", () => {
      let clearCount = 0;
      let addChildCount = 0;
      let focusCount = 0;

      const mockEditor = {
        setText: () => {},
      };

      const mockEditorContainer = {
        clear: () => {
          clearCount++;
        },
        addChild: (_child: unknown) => {
          addChildCount++;
        },
      };

      const mockTui = {
        setFocus: (_component: unknown) => {
          focusCount++;
        },
      };

      hideModelSelector(
        mockEditorContainer as never,
        mockEditor as never,
        mockTui as never,
      );

      assert.strictEqual(clearCount, 1);
      assert.strictEqual(addChildCount, 1);
      assert.strictEqual(focusCount, 1);
    });
  });
});
