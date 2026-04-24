import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TextPart } from "ai";
import { PromptManager } from "../../source/prompts/manager.ts";
import { createMockTokenCounter } from "../utils/mocking.ts";

describe("PromptManager", () => {
  describe("get", () => {
    it("should return the prompt when set", () => {
      const manager = new PromptManager(createMockTokenCounter());
      manager.set("hello world");
      assert.equal(manager.get(), "hello world");
    });

    it("should throw when no prompt and no context", () => {
      const manager = new PromptManager(createMockTokenCounter());
      assert.throws(() => manager.get(), /No prompt available/);
    });

    it("should return empty string when no prompt but context exists", () => {
      const manager = new PromptManager(createMockTokenCounter());
      manager.addContext("file content");
      assert.equal(manager.get(), "");
    });

    it("should return prompt when both prompt and context exist", () => {
      const manager = new PromptManager(createMockTokenCounter());
      manager.set("hello");
      manager.addContext("file content");
      assert.equal(manager.get(), "hello");
    });
  });

  describe("getUserMessage", () => {
    it("should create a message with prompt only", () => {
      const manager = new PromptManager(createMockTokenCounter());
      manager.set("hello world");
      const msg = manager.getUserMessage();
      assert.equal(msg.role, "user");
      assert.ok(Array.isArray(msg.content));
      assert.equal(msg.content.length, 1);
      assert.equal((msg.content[0] as TextPart).text, "hello world");
    });

    it("should create a message with context only (no prompt text)", () => {
      const manager = new PromptManager(createMockTokenCounter());
      manager.addContext("file content here");
      const msg = manager.getUserMessage();
      assert.equal(msg.role, "user");
      assert.ok(Array.isArray(msg.content));
      assert.equal(msg.content.length, 1);
      assert.equal((msg.content[0] as TextPart).text, "file content here");
    });

    it("should create a message with both context and prompt", () => {
      const manager = new PromptManager(createMockTokenCounter());
      manager.set("review this");
      manager.addContext("file content");
      const msg = manager.getUserMessage();
      assert.equal(msg.role, "user");
      assert.ok(Array.isArray(msg.content));
      assert.equal(msg.content.length, 2);
      assert.equal((msg.content[0] as TextPart).text, "file content");
      assert.equal((msg.content[1] as TextPart).text, "review this");
    });

    it("should throw when no prompt and no context", () => {
      const manager = new PromptManager(createMockTokenCounter());
      assert.throws(() => manager.getUserMessage(), /No prompt available/);
    });
  });
});
