import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { select } from "../../source/terminal/select-prompt.ts";

function createMockTerminal() {
  const stdin = new EventEmitter() as any;
  stdin.isTTY = true;
  stdin.setRawMode = () => {};
  stdin.pause = () => {};
  stdin.resume = () => {};
  stdin.setEncoding = () => {};
  stdin.removeListener = () => {};

  const outputChunks: string[] = [];
  const stdout: any = {
    write: (chunk: string) => {
      outputChunks.push(chunk);
      return true;
    },
    isTTY: true,
    getOutput: () => outputChunks.join(""),
    reset: () => {
      outputChunks.length = 0;
    },
  };

  return { stdin, stdout };
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("select interactive", () => {
  it("should return the selected value on Enter", async () => {
    const term = createMockTerminal();
    const promise = select({
      message: "Pick",
      choices: ["Apple", "Banana", "Cherry"],
      terminal: { stdin: term.stdin, stdout: term.stdout },
    });

    // Give the promise time to set up the listener
    await delay(10);

    // Press Enter to select the first item (Apple)
    term.stdin.emit("data", "\r");

    const result = await promise;
    assert.equal(result, "Apple");
  });

  it("should navigate with arrow keys and select with Enter", async () => {
    const term = createMockTerminal();
    const promise = select({
      message: "Pick",
      choices: ["Apple", "Banana", "Cherry"],
      terminal: { stdin: term.stdin, stdout: term.stdout },
    });

    await delay(10);

    // Move down twice
    term.stdin.emit("data", "\x1b[B");
    await delay(5);
    term.stdin.emit("data", "\x1b[B");
    await delay(5);

    // Select
    term.stdin.emit("data", "\r");

    const result = await promise;
    assert.equal(result, "Cherry");
  });

  it("should navigate up with arrow key and select with Enter", async () => {
    const term = createMockTerminal();
    const promise = select({
      message: "Pick",
      choices: ["Apple", "Banana", "Cherry"],
      initial: 2,
      terminal: { stdin: term.stdin, stdout: term.stdout },
    });

    await delay(10);

    // Move up once (from Cherry to Banana)
    term.stdin.emit("data", "\x1b[A");
    await delay(5);

    // Select
    term.stdin.emit("data", "\r");

    const result = await promise;
    assert.equal(result, "Banana");
  });

  it("should go to first item on Home key", async () => {
    const term = createMockTerminal();
    const promise = select({
      message: "Pick",
      choices: ["Apple", "Banana", "Cherry", "Date"],
      initial: 3,
      terminal: { stdin: term.stdin, stdout: term.stdout },
    });

    await delay(10);

    // Press Home to go to first item
    term.stdin.emit("data", "\x1b[H");
    await delay(5);

    // Select
    term.stdin.emit("data", "\r");

    const result = await promise;
    assert.equal(result, "Apple");
  });

  it("should go to last item on End key", async () => {
    const term = createMockTerminal();
    const promise = select({
      message: "Pick",
      choices: ["Apple", "Banana", "Cherry", "Date"],
      terminal: { stdin: term.stdin, stdout: term.stdout },
    });

    await delay(10);

    // Press End to go to last item
    term.stdin.emit("data", "\x1b[F");
    await delay(5);

    // Select
    term.stdin.emit("data", "\r");

    const result = await promise;
    assert.equal(result, "Date");
  });

  it("should cancel on Ctrl+C", async () => {
    const term = createMockTerminal();
    const promise = select({
      message: "Pick",
      choices: ["Apple", "Banana", "Cherry"],
      terminal: { stdin: term.stdin, stdout: term.stdout },
    });

    await delay(10);

    // Press Ctrl+C
    term.stdin.emit("data", "\x03");

    await assert.rejects(promise, { isCanceled: true });
  });

  it("should filter via search with printable characters", async () => {
    const term = createMockTerminal();
    const promise = select({
      message: "Pick",
      choices: ["Apple", "Banana", "Apricot", "Cherry"],
      terminal: { stdin: term.stdin, stdout: term.stdout },
    });

    await delay(10);

    // Type "ap" to filter to Apple, Apricot
    term.stdin.emit("data", "a");
    await delay(5);
    term.stdin.emit("data", "p");
    await delay(5);

    // Navigate to the second filtered item (Apricot)
    term.stdin.emit("data", "\x1b[B");
    await delay(5);

    // Select
    term.stdin.emit("data", "\r");

    const result = await promise;
    assert.equal(result, "Apricot");
  });

  it("should clear search on backspace when search is empty", async () => {
    const term = createMockTerminal();
    const promise = select({
      message: "Pick",
      choices: ["Apple", "Banana", "Apricot", "Cherry"],
      terminal: { stdin: term.stdin, stdout: term.stdout },
    });

    await delay(10);

    // Type "a" to filter
    term.stdin.emit("data", "a");
    await delay(5);

    // Backspace to clear search
    term.stdin.emit("data", "\x7f");
    await delay(5);

    // Now we should have all items back; select
    term.stdin.emit("data", "\r");

    const result = await promise;
    // With search cleared, first item is Apple
    assert.equal(result, "Apple");
  });

  it("should handle backspace removing one character at a time", async () => {
    const term = createMockTerminal();
    const promise = select({
      message: "Pick",
      choices: ["Apple", "Banana", "Avocado", "Apricot"],
      terminal: { stdin: term.stdin, stdout: term.stdout },
    });

    await delay(10);

    // Type "ap" to filter to Apple, Apricot
    term.stdin.emit("data", "a");
    await delay(5);
    term.stdin.emit("data", "p");
    await delay(5);

    // Backspace once to remove "p" -> search becomes "a" -> shows Apple, Avocado
    term.stdin.emit("data", "\x7f");
    await delay(5);

    // Select - should pick Apple (first in filtered results for "a")
    term.stdin.emit("data", "\r");

    const result = await promise;
    assert.equal(result, "Apple");
  });

  it("should handle disabled choices gracefully", async () => {
    const term = createMockTerminal();
    const promise = select({
      message: "Pick",
      choices: [
        { name: "Apple", value: "apple" },
        { name: "Banana", value: "banana", disabled: true },
        { name: "Cherry", value: "cherry" },
      ],
      terminal: { stdin: term.stdin, stdout: term.stdout },
    });

    await delay(10);

    // Arrow down should skip disabled Banana and land on Cherry
    term.stdin.emit("data", "\x1b[B");
    await delay(5);
    term.stdin.emit("data", "\r");

    const result = await promise;
    assert.equal(result, "cherry");
  });

  it("should throw on empty choices", async () => {
    const term = createMockTerminal();
    await assert.rejects(
      select({
        message: "Pick",
        choices: [],
        terminal: { stdin: term.stdin, stdout: term.stdout },
      }),
      /choices must be a non-empty array/,
    );
  });

  it("should throw on all disabled choices", async () => {
    const term = createMockTerminal();
    await assert.rejects(
      select({
        message: "Pick",
        choices: [
          { name: "Apple", value: "apple", disabled: true },
          { name: "Banana", value: "banana", disabled: true },
        ],
        terminal: { stdin: term.stdin, stdout: term.stdout },
      }),
      /At least one choice must be enabled/,
    );
  });

  it("should reset pointer to first enabled when clearing search", async () => {
    const term = createMockTerminal();
    const promise = select({
      message: "Pick",
      choices: [
        { name: "Apple", value: "apple", disabled: true },
        { name: "Banana", value: "banana" },
        { name: "Cherry", value: "cherry" },
      ],
      terminal: { stdin: term.stdin, stdout: term.stdout },
    });

    await delay(10);

    // Initially the first enabled is Banana (Apple is disabled)
    // Type "ch" to filter to Cherry only
    term.stdin.emit("data", "c");
    await delay(5);
    term.stdin.emit("data", "h");
    await delay(5);

    // Backspace twice to clear search
    term.stdin.emit("data", "\x7f");
    await delay(5);
    term.stdin.emit("data", "\x7f");
    await delay(5);

    // Select - should pick Banana (first enabled)
    term.stdin.emit("data", "\r");

    const result = await promise;
    assert.equal(result, "banana");
  });
});
