import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { ModelManager } from "../source/models/manager.ts";
import { SessionManager } from "../source/sessions/manager.ts";
import { TokenTracker } from "../source/tokens/tracker.ts";

describe("SessionManager", () => {
  describe("context window functionality", () => {
    let messageHistory: SessionManager;
    let modelManager: ModelManager;
    let tokenTracker: TokenTracker;

    beforeEach(() => {
      modelManager = new ModelManager({ stateDir: "/tmp/test-state" });
      tokenTracker = new TokenTracker();
      messageHistory = new SessionManager({
        stateDir: "/tmp/test-state",
        modelManager,
        tokenTracker,
      });
    });

    it("should initialize with context window of 0", () => {
      assert.strictEqual(messageHistory.getContextWindow(), 0);
    });

    it("should set and get context window", () => {
      messageHistory.setContextWindow(5000);
      assert.strictEqual(messageHistory.getContextWindow(), 5000);
    });

    it("should set and get context window with large value", () => {
      messageHistory.setContextWindow(1000000);
      assert.strictEqual(messageHistory.getContextWindow(), 1000000);
    });

    it("should set and get context window with zero", () => {
      messageHistory.setContextWindow(0);
      assert.strictEqual(messageHistory.getContextWindow(), 0);
    });

    it("should reset context window on clear", () => {
      messageHistory.setContextWindow(5000);
      messageHistory.clear();
      assert.strictEqual(messageHistory.getContextWindow(), 0);
    });

    it("should throw error when setting negative context window", () => {
      assert.throws(() => messageHistory.setContextWindow(-100), {
        name: "Error",
        message: "Context window cannot be negative",
      });
    });

    it("should not throw error when setting zero context window", () => {
      assert.doesNotThrow(() => messageHistory.setContextWindow(0));
    });

    it("should not throw error when setting positive context window", () => {
      assert.doesNotThrow(() => messageHistory.setContextWindow(1000));
    });
  });
});
