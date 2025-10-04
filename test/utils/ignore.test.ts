import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ignore from "../../source/utils/ignore.ts";

describe("ignore", () => {
  it("should create an ignore instance", () => {
    const ig = ignore();
    assert.ok(ig);
    assert.strictEqual(typeof ig.add, "function");
    assert.strictEqual(typeof ig.ignores, "function");
  });

  it("should ignore patterns", () => {
    const ig = ignore().add(["node_modules", "*.log", ".DS_Store", "*.backup"]);
    assert.strictEqual(ig.ignores("node_modules"), true);
    assert.strictEqual(ig.ignores("test.log"), true);
    assert.strictEqual(ig.ignores("src/index.ts"), false);
    assert.strictEqual(ig.ignores("source/.DS_Store"), true);
    assert.strictEqual(ig.ignores("source/test/a/file.ts.backup"), true);
  });

  it("should handle negated patterns", () => {
    const ig = ignore().add(["*.js", "!index.js"]);
    assert.strictEqual(ig.ignores("app.js"), true);
    assert.strictEqual(ig.ignores("index.js"), false);
  });

  it("should filter paths", () => {
    const ig = ignore().add(["*.tmp"]);
    const paths = ["file.txt", "temp.tmp", "data.json"];
    const filtered = ig.filter(paths);
    assert.deepStrictEqual(filtered, ["file.txt", "data.json"]);
  });

  it("should create a filter function", () => {
    const ig = ignore().add(["*.md"]);
    const filter = ig.createFilter();
    assert.strictEqual(filter("README.md"), false);
    assert.strictEqual(filter("package.json"), true);
  });
});
