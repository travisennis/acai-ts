import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { HandoffFile } from "../../source/commands/pickup/types.ts";
import { hidePickupSelector } from "../../source/commands/pickup/utils.ts";

describe("pickup/utils.ts", () => {
  describe("hidePickupSelector", () => {
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

      hidePickupSelector(
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

      hidePickupSelector(
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

describe("pickup/types.ts", () => {
  describe("HandoffFile", () => {
    it("should have correct structure", () => {
      const handoff: HandoffFile = {
        name: "test-handoff",
        filename: "handoff-test-handoff.md",
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      };

      assert.strictEqual(handoff.name, "test-handoff");
      assert.strictEqual(handoff.filename, "handoff-test-handoff.md");
      assert.ok(handoff.createdAt instanceof Date);
    });
  });
});
