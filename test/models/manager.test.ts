import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ModelManager } from "../../source/models/manager.ts";
import type { ModelName } from "../../source/models/providers.ts";

describe("ModelManager", () => {
  describe("EventEmitter functionality", () => {
    it("should emit 'set-model' event when setModel is called", async () => {
      const modelManager = new ModelManager({ stateDir: "/tmp/test-state" });

      const promise = new Promise<void>((resolve) => {
        modelManager.on("set-model", (app, model) => {
          assert.strictEqual(app, "repl");
          assert.strictEqual(model, "openai:o3");
          resolve();
        });
      });

      modelManager.setModel("repl", "openai:o3");
      await promise;
    });

    it("should emit multiple 'set-model' events for different apps", () => {
      const modelManager = new ModelManager({ stateDir: "/tmp/test-state" });
      const events: [string, ModelName][] = [];

      modelManager.on("set-model", (app, model) => {
        events.push([app, model]);
      });

      modelManager.setModel("repl", "openai:o3");
      modelManager.setModel("cli", "openai:gpt-4.1");

      assert.strictEqual(events.length, 2);
      assert.deepStrictEqual(events[0], ["repl", "openai:o3"]);
      assert.deepStrictEqual(events[1], ["cli", "openai:gpt-4.1"]);
    });

    it("should allow listening to 'set-model' events before they occur", () => {
      const modelManager = new ModelManager({ stateDir: "/tmp/test-state" });
      const eventHistory: [string, ModelName][] = [];

      // Set up listener first
      modelManager.on("set-model", (app, model) => {
        eventHistory.push([app, model]);
      });

      // Then trigger events
      modelManager.setModel("repl", "openai:o3");
      modelManager.setModel("cli", "openai:gpt-4.1");

      assert.strictEqual(eventHistory.length, 2);
      assert.deepStrictEqual(eventHistory[0], ["repl", "openai:o3"]);
      assert.deepStrictEqual(eventHistory[1], ["cli", "openai:gpt-4.1"]);
    });
  });

  describe("inheritance from EventEmitter", () => {
    it("should be an instance of EventEmitter", () => {
      const modelManager = new ModelManager({ stateDir: "/tmp/test-state" });
      assert.ok(modelManager instanceof EventEmitter);
    });

    it("should have EventEmitter methods available", () => {
      const modelManager = new ModelManager({ stateDir: "/tmp/test-state" });

      assert.strictEqual(typeof modelManager.on, "function");
      assert.strictEqual(typeof modelManager.emit, "function");
      assert.strictEqual(typeof modelManager.addListener, "function");
      assert.strictEqual(typeof modelManager.removeListener, "function");
      assert.strictEqual(typeof modelManager.off, "function");
    });
  });
});

// Import EventEmitter for type checking
import EventEmitter from "node:events";
