import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMutatingCommand } from "../../source/tools/bash-utils.ts";

describe("bash-utils - isMutatingCommand", () => {
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
