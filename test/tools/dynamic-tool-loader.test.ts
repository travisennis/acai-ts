import { strict as assert } from "node:assert/strict";
import { describe, it } from "node:test";
import { parseToolMetadata } from "../../source/tools/dynamic-tool-loader.ts";

describe("Dynamic Tool Parser", () => {
  const sampleOutput = JSON.stringify(
    {
      name: "run-tests",
      description:
        "Run tests in a project workspace with proper output formatting",
      parameters: [
        {
          name: "dir",
          type: "string",
          description: "the workspace directory to run tests in",
          required: false,
          default: ".",
        },
      ],
    },
    null,
    2,
  );

  it("should parse valid metadata correctly", () => {
    const metadata = parseToolMetadata(sampleOutput);
    assert.equal(metadata.name, "run-tests");
    assert.equal(
      metadata.description,
      "Run tests in a project workspace with proper output formatting",
    );
    assert.equal(metadata.parameters.length, 1);
    assert.equal(metadata.parameters[0]?.name, "dir");
    assert.equal(metadata.parameters[0]?.type, "string");
    assert.equal(
      metadata.parameters[0]?.description,
      "the workspace directory to run tests in",
    );
    assert.equal(metadata.parameters[0]?.required, false);
    assert.equal(metadata.parameters[0]?.default, ".");
  });

  it("should throw error on invalid name", () => {
    const invalidObj = JSON.parse(sampleOutput);
    invalidObj.name = "invalid name";
    const invalidOutput = JSON.stringify(invalidObj);
    assert.throws(() => parseToolMetadata(invalidOutput));
  });

  it("should handle no parameters", () => {
    const noParamsOutput = JSON.stringify(
      {
        name: "simple-tool",
        description: "A simple tool",
        parameters: [],
      },
      null,
      2,
    );
    const metadata = parseToolMetadata(noParamsOutput);
    assert.equal(metadata.parameters.length, 0);
  });
});
