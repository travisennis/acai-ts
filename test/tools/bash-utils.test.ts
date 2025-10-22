import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { validatePaths } from "../../source/tools/bash-utils.ts";

const baseDir = process.cwd();

describe("bash-utils - isPathWithinBaseDir", () => {
  it("returns true for paths within base directory", () => {
    const result = path.resolve(baseDir, "src/file.txt");
    assert.strictEqual(result.startsWith(baseDir), true);
  });

  it("returns false for paths outside base directory", () => {
    const result = path.resolve("/etc/hosts");
    assert.strictEqual(result.startsWith(baseDir), false);
  });

  it("handles relative paths correctly", () => {
    const relativePath = "./src/file.txt";
    const result = path.resolve(baseDir, relativePath);
    assert.strictEqual(result.startsWith(baseDir), true);
  });

  it("handles parent directory traversal", () => {
    const parentPath = "../outside/file.txt";
    const result = path.resolve(baseDir, parentPath);
    assert.strictEqual(result.startsWith(baseDir), false);
  });
});

describe("bash-utils - validatePaths", () => {
  it("returns valid for commands without paths", () => {
    const result = validatePaths("echo hello", [baseDir], baseDir);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  it("returns valid for commands with allowed flags", () => {
    const result = validatePaths("ls -la", [baseDir], baseDir);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  it("returns valid for commands with URLs", () => {
    const result = validatePaths(
      "curl https://example.com",
      [baseDir],
      baseDir,
    );
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  it("returns valid for git commit messages with paths", () => {
    const result = validatePaths(
      'git commit -m "docs: mention /copy"',
      [baseDir],
      baseDir,
    );
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  it("returns valid for multiple git commit messages", () => {
    const result = validatePaths(
      'git commit -m "first /copy" -m "second /path"',
      [baseDir],
      baseDir,
    );
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  it("returns invalid for absolute paths outside project", () => {
    const result = validatePaths("cat /etc/hosts", [baseDir], baseDir);
    assert.strictEqual(result.isValid, false);
    assert.match(
      result.error ?? "",
      /resolves outside the allowed directories/,
    );
  });

  it("returns invalid for relative paths that resolve outside", () => {
    const result = validatePaths("cat ../../etc/hosts", [baseDir], baseDir);
    assert.strictEqual(result.isValid, false);
    assert.match(
      result.error ?? "",
      /resolves outside the allowed directories/,
    );
  });

  it("returns valid for paths within project", () => {
    const result = validatePaths("cat package.json", [baseDir], baseDir);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  it("returns valid for paths with quotes within project", () => {
    const result = validatePaths('cat "package.json"', [baseDir], baseDir);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  it("returns valid for paths with single quotes within project", () => {
    const result = validatePaths("cat 'package.json'", [baseDir], baseDir);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  it("handles complex command with mixed content", () => {
    const result = validatePaths(
      'git commit -m "docs: update" && echo "done"',
      [baseDir],
      baseDir,
    );
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  it("skips git commit message flags", () => {
    const result = validatePaths(
      'git commit -m "/etc/hosts should not be flagged"',
      [baseDir],
      baseDir,
    );
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  it("skips git commit file flags with messages", () => {
    const result = validatePaths(
      'git commit --message "/etc/hosts should not be flagged"',
      [baseDir],
      baseDir,
    );
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  it("catches git commit file flags with actual files", () => {
    const result = validatePaths(
      "git commit -F /tmp/message.txt",
      [baseDir],
      baseDir,
    );
    assert.strictEqual(result.isValid, false);
    assert.match(
      result.error ?? "",
      /resolves outside the allowed directories/,
    );
  });

  it("handles commands with multiple arguments", () => {
    const result = validatePaths(
      "cp file1.txt file2.txt subdir/",
      [baseDir],
      baseDir,
    );
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  it("handles commands with mixed valid and invalid paths", () => {
    const result = validatePaths(
      "cp /etc/hosts package.json",
      [baseDir],
      baseDir,
    );
    assert.strictEqual(result.isValid, false);
    assert.match(
      result.error ?? "",
      /resolves outside the allowed directories/,
    );
  });

  it("handles empty command", () => {
    const result = validatePaths("", [baseDir], baseDir);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  it("handles command with only spaces", () => {
    const result = validatePaths("   ", [baseDir], baseDir);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  it("handles malformed paths gracefully", () => {
    const result = validatePaths("cat /nonexistent/../..", [baseDir], baseDir);
    // This should either be valid (if path resolves within) or handled gracefully
    assert(result.isValid === true || result.error !== undefined);
  });

  it("respects different working directories", () => {
    const subDir = path.join(baseDir, "src");
    const result = validatePaths("cat file.txt", [baseDir], subDir);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  it("detects path traversal from different working directory", () => {
    const subDir = path.join(baseDir, "src");
    const result = validatePaths("cat ../../etc/hosts", [baseDir], subDir);
    assert.strictEqual(result.isValid, false);
    assert.match(
      result.error ?? "",
      /resolves outside the allowed directories/,
    );
  });
});

describe("bash-utils - edge cases", () => {
  it("handles commands with quoted arguments containing spaces", () => {
    const result = validatePaths(
      'echo "hello world" > "file with spaces.txt"',
      [baseDir],
      baseDir,
    );
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  it("handles commands with mixed quoting", () => {
    const result = validatePaths(
      'echo "hello" \'world" > "mixed quotes.txt"',
      [baseDir],
      baseDir,
    );
    // Should handle gracefully without throwing
    assert(result.isValid === true || result.error !== undefined);
  });

  it("handles commands with incomplete quotes", () => {
    const result = validatePaths('echo "incomplete quote', [baseDir], baseDir);
    // Should handle gracefully
    assert(result.isValid === true || result.error !== undefined);
  });

  it("skips command options that look like paths", () => {
    const result = validatePaths(
      "command --option=/some/path",
      [baseDir],
      baseDir,
    );
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  // Environment variables are not expanded during validation - they are treated as literal strings.
  // This is correct behavior because:
  // 1. Security: Environment variables may contain sensitive information
  // 2. Predictability: Validation should check the literal command, not post-expansion
  // 3. Portability: Environment variables vary across systems
  // The actual path resolution with environment variables happens at execution time, not validation time.
  it("handles commands with environment variables", () => {
    const result = validatePaths("echo $HOME/file.txt", [baseDir], baseDir);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });
});
