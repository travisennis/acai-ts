import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { addUniqueDir, expandTildePath } from "../source/index.ts";

describe("expandTildePath", () => {
  it("expands ~/ to the home directory", () => {
    assert.equal(expandTildePath("~/foo"), path.join(os.homedir(), "foo"));
  });

  it("expands bare ~ to the home directory", () => {
    assert.equal(expandTildePath("~"), os.homedir());
  });

  it("returns the path unchanged if it does not start with ~", () => {
    assert.equal(expandTildePath("/absolute/path"), "/absolute/path");
  });

  it("returns the path unchanged for relative paths", () => {
    assert.equal(expandTildePath("relative/path"), "relative/path");
  });
});

describe("addUniqueDir", () => {
  it("adds a resolved directory to the list", () => {
    const dirs: string[] = [];
    addUniqueDir("/foo/bar", dirs);
    assert.deepEqual(dirs, [path.resolve("/foo/bar")]);
  });

  it("does not add a duplicate directory", () => {
    const dirs: string[] = [path.resolve("/foo/bar")];
    addUniqueDir("/foo/bar", dirs);
    assert.deepEqual(dirs, [path.resolve("/foo/bar")]);
  });

  it("expands tilde before resolving", () => {
    const dirs: string[] = [];
    addUniqueDir("~/projects", dirs);
    assert.deepEqual(dirs, [path.resolve(path.join(os.homedir(), "projects"))]);
  });

  it("handles multiple unique directories", () => {
    const dirs: string[] = [];
    addUniqueDir("/first", dirs);
    addUniqueDir("/second", dirs);
    assert.deepEqual(dirs, [path.resolve("/first"), path.resolve("/second")]);
  });

  it("resolves relative paths against cwd", () => {
    const dirs: string[] = [];
    addUniqueDir("relative/path", dirs);
    assert.deepEqual(dirs, [path.resolve("relative/path")]);
  });
});
