import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseFrontMatter } from "../../source/utils/yaml.ts";

describe("parseYaml (via parseFrontMatter)", () => {
  it("parses simple key: value pairs", () => {
    const { data } = parseFrontMatter("---\nname: Travis\ntitle: Engineer\n---\nContent");
    assert.equal(data["name"], "Travis");
    assert.equal(data["title"], "Engineer");
  });

  it("parses inline values after colon", () => {
    const { data } = parseFrontMatter("---\ncount: 42\n---\nContent");
    assert.equal(data["count"], 42);
  });

  it("parses boolean values", () => {
    const { data } = parseFrontMatter("---\nenabled: true\ndisabled: false\n---\nContent");
    assert.equal(data["enabled"], true);
    assert.equal(data["disabled"], false);
  });

  it("parses null values", () => {
    const { data } = parseFrontMatter("---\nvalue: null\nother: ~\n---\nContent");
    assert.equal(data["value"], null);
    assert.equal(data["other"], null);
  });

  it("parses quoted strings", () => {
    const { data } = parseFrontMatter('---\nname: "John Doe"\ntitle: \'Engineer\'\n---\nContent');
    assert.equal(data["name"], "John Doe");
    assert.equal(data["title"], "Engineer");
  });

  it("parses nested objects", () => {
    const { data } = parseFrontMatter("---\nperson:\n  name: Alice\n  age: 30\n---\nContent");
    assert.deepEqual(data["person"], { name: "Alice", age: 30 });
  });

  it("parses deeply nested objects", () => {
    const { data } = parseFrontMatter("---\nlevel1:\n  level2:\n    level3: deep\n---\nContent");
    assert.deepEqual(data["level1"], { level2: { level3: "deep" } });
  });

  it("parses arrays with dash items", () => {
    const { data } = parseFrontMatter("---\nitems:\n  - apple\n  - banana\n  - cherry\n---\nContent");
    assert.deepEqual(data["items"], ["apple", "banana", "cherry"]);
  });

  it("parses arrays with inline values after dash", () => {
    const { data } = parseFrontMatter("---\nitems:\n  - apple\n  - banana\n---\nContent");
    assert.deepEqual(data["items"], ["apple", "banana"]);
  });

  it("parses mixed content with comments", () => {
    const { data } = parseFrontMatter("---\n# This is a comment\nname: Test\n# Another comment\ncount: 10\n---\nContent");
    assert.equal(data["name"], "Test");
    assert.equal(data["count"], 10);
  });

  it("skips lines without colons", () => {
    const { data } = parseFrontMatter("---\nname: Test\ninvalidline\ncount: 10\n---\nContent");
    assert.equal(data["name"], "Test");
    assert.equal(data["count"], 10);
  });

  it("handles empty front matter", () => {
    const { data, content } = parseFrontMatter("---\n---\nContent");
    assert.deepEqual(data, {});
    assert.equal(content, "Content");
  });

  it("handles no front matter", () => {
    const { data, content } = parseFrontMatter("Content without front matter");
    assert.deepEqual(data, {});
    assert.equal(content, "Content without front matter");
  });

  it("handles key with no value and no following content", () => {
    const { data } = parseFrontMatter("---\nkey:\n---\nContent");
    assert.equal(data["key"], null);
  });

  it("handles float numbers", () => {
    const { data } = parseFrontMatter("---\npi: 3.14\n---\nContent");
    assert.equal(data["pi"], 3.14);
  });

  it("handles empty lines in values", () => {
    const { data } = parseFrontMatter("---\nname: Test\n\ncount: 5\n---\nContent");
    assert.equal(data["name"], "Test");
    assert.equal(data["count"], 5);
  });

  it("handles number-like strings", () => {
    const { data } = parseFrontMatter('---\nversion: "123"\n---\nContent');
    assert.equal(data["version"], "123");
  });
});
