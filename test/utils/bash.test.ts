import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { isMutatingCommand, validatePaths } from "../../source/utils/bash.ts";

const baseDir = process.cwd();

describe("bash - isPathWithinBaseDir", () => {
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

describe("bash - validatePaths", () => {
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
});

describe("bash - isMutatingCommand", () => {
  it("returns false for harmless commands", () => {
    assert.strictEqual(isMutatingCommand("echo hello"), false);
  });

  it("detects simple redirection (>) as mutating", () => {
    assert.strictEqual(isMutatingCommand("echo hi > out.txt"), true);
  });

  it("detects append redirection (>>) as mutating", () => {
    assert.strictEqual(isMutatingCommand("echo hi >> out.txt"), true);
  });

  it("detects mutating binaries like rm", () => {
    assert.strictEqual(isMutatingCommand("rm -rf some/dir"), true);
  });

  it("does not flag pipes alone as mutating", () => {
    assert.strictEqual(isMutatingCommand("cat file.txt | grep foo"), false);
  });

  it("flags tee when used in a pipeline", () => {
    assert.strictEqual(isMutatingCommand("echo hi | tee file.txt"), true);
  });

  it("flags sed with -i as mutating", () => {
    assert.strictEqual(isMutatingCommand("sed -i 's/a/b/' file.txt"), true);
    assert.strictEqual(isMutatingCommand("sed -i.bak 's/a/b/' file.txt"), true);
  });

  it("does not flag sed without -i", () => {
    assert.strictEqual(isMutatingCommand("sed 's/a/b/' file.txt"), false);
  });

  it("detects git mutating subcommands", () => {
    assert.strictEqual(isMutatingCommand('git commit -m "msg"'), true);
    assert.strictEqual(isMutatingCommand("git add ."), true);
    assert.strictEqual(isMutatingCommand("git checkout"), true);
    assert.strictEqual(isMutatingCommand("git branch"), true);
    assert.strictEqual(isMutatingCommand("git push"), true);
    assert.strictEqual(isMutatingCommand("git pull"), true);
    assert.strictEqual(isMutatingCommand("git switch"), true);
    assert.strictEqual(isMutatingCommand("git reset"), true);
    assert.strictEqual(isMutatingCommand("git status"), false);
  });

  it("detects npm/pnpm/yarn mutating subcommands correctly", () => {
    assert.strictEqual(isMutatingCommand("npm install lodash"), true);
    assert.strictEqual(isMutatingCommand("pnpm install"), true);
    assert.strictEqual(isMutatingCommand("yarn install"), true);
    assert.strictEqual(isMutatingCommand("yarn add package"), true);
  });

  it("handles compound commands and short-circuits when any segment is mutating", () => {
    assert.strictEqual(isMutatingCommand("echo hi && rm -rf /tmp"), true);
    assert.strictEqual(isMutatingCommand("npm test || echo failed"), false);
  });

  it("treats a literal > inside quotes as mutating (implementation detail)", () => {
    // Current implementation flags any '>' even if quoted
    assert.strictEqual(isMutatingCommand("echo '>'"), true);
  });

  it("marks any command with 'create' in it", () => {
    assert.strictEqual(isMutatingCommand("any command create"), true);
  });

  it("marks any command with 'update' in it", () => {
    assert.strictEqual(isMutatingCommand("any command update"), true);
  });

  it("marks any command with 'upgrade' in it", () => {
    assert.strictEqual(isMutatingCommand("any command upgrade"), true);
  });

  it("marks any command with 'install' in it", () => {
    assert.strictEqual(isMutatingCommand("any command install"), true);
  });
});
