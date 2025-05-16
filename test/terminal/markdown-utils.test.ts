import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getListNumber } from "../../source/terminal/markdown-utils.ts";

describe("getListNumber", () => {
  it("should return the number as a string for listDepth 0", () => {
    assert.strictEqual(getListNumber(0, 1), "1");
    assert.strictEqual(getListNumber(0, 10), "10");
  });

  it("should return the number as a string for listDepth 1", () => {
    assert.strictEqual(getListNumber(1, 1), "1");
    assert.strictEqual(getListNumber(1, 5), "5");
  });

  it("should return lowercase letters for listDepth 2", () => {
    assert.strictEqual(getListNumber(2, 1), "a");
    assert.strictEqual(getListNumber(2, 26), "z");
    assert.strictEqual(getListNumber(2, 27), "aa");
  });

  it("should return lowercase Roman numerals for listDepth 3", () => {
    assert.strictEqual(getListNumber(3, 1), "i");
    assert.strictEqual(getListNumber(3, 5), "v");
    assert.strictEqual(getListNumber(3, 10), "x");
    assert.strictEqual(getListNumber(3, 20), "xx");
    assert.strictEqual(getListNumber(3, 39), "xxxix");
  });

  it("should return the number as a string for listDepth greater than 3", () => {
    assert.strictEqual(getListNumber(4, 1), "1");
    assert.strictEqual(getListNumber(5, 10), "10");
  });

  it("should correctly calculate alphabetical representation for depth 2 for any positive number", () => {
    assert.strictEqual(getListNumber(2, 53), "ba");
    assert.strictEqual(getListNumber(2, 703), "aaa");
  });

  it("should handle orderedListNumber out of predefined range for depth 3 by calculating Roman numeral", () => {
    // Assuming DEPTH_2_LIST_NUMBERS has 40 entries (i-xl)
    assert.strictEqual(getListNumber(3, 41), "xli");
    assert.strictEqual(getListNumber(3, 50), "l");
  });

  it("should return an empty string for non-positive numbers for depth 2", () => {
    assert.strictEqual(getListNumber(2, 0), "");
    assert.strictEqual(getListNumber(2, -1), "");
    assert.strictEqual(getListNumber(2, 100), "cv"); // Positive case still valid
  });

  it("should return an empty string for non-positive numbers and correct Roman for positive for depth 3", () => {
    assert.strictEqual(getListNumber(3, 0), "");
    assert.strictEqual(getListNumber(3, -5), "");
    assert.strictEqual(getListNumber(3, 50), "l");
    assert.strictEqual(getListNumber(3, 1994), "mcmxciv");
  });
});
