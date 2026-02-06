import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { replaceArgumentPlaceholders } from "../../source/utils/templates.ts";

describe("replaceArgumentPlaceholders", () => {
  it("should replace positional placeholders", () => {
    const result = replaceArgumentPlaceholders("Hello $1 and $2", [
      "world",
      "universe",
    ]);
    assert.equal(result, "Hello world and universe");
  });

  it("should replace $ARGUMENTS with all args joined", () => {
    const result = replaceArgumentPlaceholders("Run: $ARGUMENTS", [
      "foo",
      "bar",
    ]);
    assert.equal(result, "Run: foo bar");
  });

  it("should replace {{INPUT}} with all args joined", () => {
    const result = replaceArgumentPlaceholders("Input: {{INPUT}}", [
      "a",
      "b",
      "c",
    ]);
    assert.equal(result, "Input: a b c");
  });

  it("should append args when no placeholders are found", () => {
    const result = replaceArgumentPlaceholders("No placeholders here", [
      "extra",
      "args",
    ]);
    assert.equal(result, "No placeholders here\n\nextra args");
  });

  it("should not append when args are empty", () => {
    const result = replaceArgumentPlaceholders("No placeholders here", []);
    assert.equal(result, "No placeholders here");
  });

  it("should handle content with no args and no placeholders", () => {
    const result = replaceArgumentPlaceholders("Plain content", []);
    assert.equal(result, "Plain content");
  });
});
