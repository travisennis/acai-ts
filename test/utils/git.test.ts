import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { getGitStatus } from "../../source/utils/git.ts";

describe("getGitStatus", () => {
  let testDir: string;

  before(() => {
    testDir = mkdtempSync(join(tmpdir(), "git-test-"));
    execSync("git init", { cwd: testDir });
    execSync("git config user.email test@test.com", { cwd: testDir });
    execSync("git config user.name Test User", { cwd: testDir });
    // Initial commit
    writeFileSync(join(testDir, "README.md"), "# Test\n");
    execSync("git add README.md && git commit -m 'init'", { cwd: testDir });
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns all zeros for a clean working tree", async () => {
    const prevDir = process.cwd();
    process.chdir(testDir);
    try {
      const result = await getGitStatus();
      assert.deepEqual(result, { added: 0, modified: 0, deleted: 0, untracked: 0 });
    } finally {
      process.chdir(prevDir);
    }
  });

  it("detects untracked files", async () => {
    const prevDir = process.cwd();
    process.chdir(testDir);
    try {
      writeFileSync(join(testDir, "untracked.ts"), "const x = 1;\n");
      const result = await getGitStatus();
      assert.equal(result.untracked, 1);
      assert.equal(result.added, 0);
      assert.equal(result.modified, 0);
      assert.equal(result.deleted, 0);
    } finally {
      // Clean up the untracked file
      rmSync(join(testDir, "untracked.ts"), { force: true });
      process.chdir(prevDir);
    }
  });

  it("detects staged new files", async () => {
    const prevDir = process.cwd();
    process.chdir(testDir);
    try {
      writeFileSync(join(testDir, "new-file.ts"), "const y = 2;\n");
      execSync("git add new-file.ts", { cwd: testDir });
      const result = await getGitStatus();
      assert.equal(result.added, 1);
      assert.equal(result.untracked, 0);
    } finally {
      execSync("git reset HEAD new-file.ts", { cwd: testDir });
      rmSync(join(testDir, "new-file.ts"), { force: true });
      process.chdir(prevDir);
    }
  });

  it("detects modified files", async () => {
    const prevDir = process.cwd();
    process.chdir(testDir);
    try {
      // Modify the README
      writeFileSync(join(testDir, "README.md"), "# Test\nModified!\n");
      const result = await getGitStatus();
      assert.equal(result.modified, 1);
    } finally {
      // Restore README
      execSync("git checkout -- README.md", { cwd: testDir });
      process.chdir(prevDir);
    }
  });

  it("detects deleted files", async () => {
    const prevDir = process.cwd();
    process.chdir(testDir);
    try {
      rmSync(join(testDir, "README.md"));
      const result = await getGitStatus();
      assert.equal(result.deleted, 1);
    } finally {
      execSync("git checkout -- README.md", { cwd: testDir });
      process.chdir(prevDir);
    }
  });

  it("handles multiple status changes simultaneously", async () => {
    const prevDir = process.cwd();
    process.chdir(testDir);
    try {
      // Set up: create a file to be deleted
      writeFileSync(join(testDir, "to-delete.ts"), "const d = 1;\n");
      execSync("git add to-delete.ts && git commit -m 'add to-delete'", { cwd: testDir });

      // Now: staged addition + worktree modification + staged deletion + untracked
      writeFileSync(join(testDir, "new-file.ts"), "const n = 1;\n");
      execSync("git add new-file.ts", { cwd: testDir });
      writeFileSync(join(testDir, "README.md"), "# Test\nModified!\n");
      rmSync(join(testDir, "to-delete.ts"));
      execSync("git add to-delete.ts", { cwd: testDir });
      writeFileSync(join(testDir, "untracked.txt"), "hello\n");

      const result = await getGitStatus();
      assert.equal(result.added, 1);
      assert.equal(result.modified, 1);
      assert.equal(result.deleted, 1);
      assert.equal(result.untracked, 1);
    } finally {
      // Cleanup
      execSync("git reset HEAD new-file.ts to-delete.ts 2>/dev/null || true", { cwd: testDir });
      rmSync(join(testDir, "new-file.ts"), { force: true });
      rmSync(join(testDir, "untracked.txt"), { force: true });
      rmSync(join(testDir, "to-delete.ts"), { force: true });
      execSync("git checkout -- README.md", { cwd: testDir });
      process.chdir(prevDir);
    }
  });
});
