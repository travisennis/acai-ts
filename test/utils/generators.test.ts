import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exhaustGenerator } from "../../source/utils/generators.ts";

describe("exhaustGenerator", () => {
  it("returns final value from synchronous generator", () => {
    function* syncGenerator(): Generator<number, string, void> {
      yield 1;
      yield 2;
      return "done";
    }

    const result = exhaustGenerator(syncGenerator());

    assert.equal(result, "done");
  });

  it("handles generator that completes immediately", () => {
    // biome-ignore lint/correctness/useYield: for testing
    function* immediate(): Generator<never, number, void> {
      return 42;
    }

    const result = exhaustGenerator(immediate());

    assert.equal(result, 42);
  });

  it("resolves final value from asynchronous generator", async () => {
    async function* asyncGenerator(): AsyncGenerator<number, string, void> {
      yield await Promise.resolve(1);
      yield await Promise.resolve(2);
      return Promise.resolve("async-done");
    }

    const result = await exhaustGenerator(asyncGenerator());

    assert.equal(result, "async-done");
  });
});
