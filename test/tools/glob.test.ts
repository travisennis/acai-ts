import assert from "node:assert/strict";
import test from "node:test";

import { GlobTool, inputSchema } from "../../source/tools/glob.ts";

test("glob tool has correct name", () => {
  assert.equal(GlobTool.name, "Glob");
});

test("glob tool input schema validates required fields", () => {
  // Valid input with all nullable fields set to null
  const validInput = {
    patterns: "*.ts",
    path: "/some/path",
    gitignore: null,
    recursive: null,
    expandDirectories: null,
    ignoreFiles: null,
    cwd: null,
  };

  assert.doesNotThrow(() => {
    inputSchema.parse(validInput);
  });

  // Valid input with array patterns
  const validArrayInput = {
    patterns: ["*.ts", "**/*.js"],
    path: "/some/path",
    gitignore: null,
    recursive: null,
    expandDirectories: null,
    ignoreFiles: null,
    cwd: null,
  };

  assert.doesNotThrow(() => {
    inputSchema.parse(validArrayInput);
  });

  // Invalid input - missing required fields
  const invalidInput = {
    patterns: "*.ts",
    // missing path
    gitignore: null,
    recursive: null,
    expandDirectories: null,
    ignoreFiles: null,
    cwd: null,
  };

  assert.throws(() => {
    inputSchema.parse(invalidInput);
  });
});

test("glob tool input schema handles optional fields", () => {
  // Valid input with all optional fields
  const fullInput = {
    patterns: "*.ts",
    path: "/some/path",
    gitignore: true,
    recursive: false,
    expandDirectories: false,
    ignoreFiles: ".gitignore",
    cwd: "/custom/cwd",
  };

  assert.doesNotThrow(() => {
    inputSchema.parse(fullInput);
  });

  // Valid input with null nullable fields
  const nullInput = {
    patterns: "*.ts",
    path: "/some/path",
    gitignore: null,
    recursive: null,
    expandDirectories: null,
    ignoreFiles: null,
    cwd: null,
  };

  assert.doesNotThrow(() => {
    inputSchema.parse(nullInput);
  });

  // Valid input with ignoreFiles as array
  const arrayInput = {
    patterns: "*.ts",
    path: "/some/path",
    gitignore: null,
    recursive: null,
    expandDirectories: null,
    ignoreFiles: [".gitignore", ".prettierignore"],
    cwd: null,
  };

  assert.doesNotThrow(() => {
    inputSchema.parse(arrayInput);
  });
});
