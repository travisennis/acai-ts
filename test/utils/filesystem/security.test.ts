import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import {
  isPathWithinAllowedDirs,
  validatePath,
} from "../../../source/utils/filesystem/security.ts";
import { createTempDir } from "../../utils/test-fixtures.ts";

const projectRoot = process.cwd();

await test("validatePath allows the allowedDirectory itself", async () => {
  const allowed = projectRoot;
  const resolved = await validatePath(allowed, allowed);
  assert.equal(path.resolve(resolved), path.resolve(allowed));
});

await test("validatePath allows descendants of allowedDirectory", async () => {
  // Use projectRoot as the allowed directory
  const allowed = projectRoot;
  // Create test directory inside project root
  const testDirName = `.acai-ci-tmp-validatePath-${Date.now()}`;
  const dir = path.join(allowed, testDirName);
  const file = path.join(dir, "child.txt");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, "ok");
  const resolved = await validatePath(file, allowed);
  assert.equal(path.resolve(resolved), path.resolve(file));
  await fs.rm(dir, { recursive: true, force: true });
});

await test("validatePath rejects paths outside allowedDirectory", async () => {
  const { path: allowed, cleanup: cleanupAllowed } = await createTempDir(
    "validatePath-rejects",
    "sub-allowed",
  );
  const outside = path.join(projectRoot, "..", "outside.txt");
  let threw = false;
  try {
    await validatePath(outside, allowed);
  } catch (_err) {
    threw = true;
  }
  assert.equal(threw, true);
  await cleanupAllowed();
});

await test("validatePath handles symlinks in ancestor directories", async () => {
  // Create test directory inside project root
  const testDirName = `.acai-ci-tmp-symlink-ancestor-${Date.now()}`;
  const tmpDir = path.join(projectRoot, testDirName);
  const realSubDir = path.join(tmpDir, "real");
  const linkDir = path.join(tmpDir, "link");
  const targetInside = path.join(tmpDir, "inside-target");

  await fs.mkdir(realSubDir, { recursive: true });
  await fs.mkdir(targetInside, { recursive: true });

  // Create symlink inside tmpDir pointing to targetInside (within allowed)
  await fs.symlink(targetInside, linkDir);

  // Validate a non-existent file under the symlink (should be allowed)
  const nonExistentInside = path.join(linkDir, "newfile.txt");
  const resolvedInside = await validatePath(nonExistentInside, tmpDir, {
    requireExistence: false,
  });
  assert.equal(path.resolve(resolvedInside), path.resolve(nonExistentInside));

  // Create symlink pointing outside allowed directory
  await fs.rm(linkDir);
  const targetOutside = path.join(projectRoot, "..", "outside-target");
  await fs.mkdir(targetOutside, { recursive: true });
  await fs.symlink(targetOutside, linkDir);

  // Validate a non-existent file under the outside symlink (should be rejected)
  const nonExistentOutside = path.join(linkDir, "newfile.txt");
  let threw = false;
  try {
    await validatePath(nonExistentOutside, tmpDir, {
      requireExistence: false,
    });
  } catch (_err) {
    threw = true;
  }
  assert.equal(threw, true);

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.rm(targetOutside, { recursive: true, force: true });
});

await test("validatePath throws for non-existent path when requireExistence is true", async () => {
  const allowed = projectRoot;
  const nonExistent = path.join(allowed, `nonexistent-${Date.now()}.txt`);
  let threw = false;
  try {
    await validatePath(nonExistent, allowed, { requireExistence: true });
  } catch (err) {
    threw = true;
    assert.ok(err instanceof Error);
    assert.ok((err as Error).message.includes("does not exist"));
  }
  assert.equal(threw, true);
});

await test("validatePath allows non-existent path when requireExistence is false", async () => {
  const allowed = projectRoot;
  const nonExistent = path.join(allowed, `nonexistent-${Date.now()}.txt`);
  const resolved = await validatePath(nonExistent, allowed, {
    requireExistence: false,
  });
  assert.equal(path.resolve(resolved), path.resolve(nonExistent));
});

await test("validatePath throws when abort signal is already aborted", async () => {
  const allowed = projectRoot;
  const controller = new AbortController();
  controller.abort();
  let threw = false;
  try {
    await validatePath(allowed, allowed, { abortSignal: controller.signal });
  } catch (err) {
    threw = true;
    assert.ok(err instanceof Error);
    assert.ok((err as Error).message.includes("aborted"));
  }
  assert.equal(threw, true);
});

await test("isPathWithinAllowedDirs expands ~ in allowedDirs", () => {
  const homeDir = process.env["HOME"] || process.env["USERPROFILE"] || "/root";
  const expandedDir = path.join(homeDir, ".config");

  // Tilde-prefixed allowed dir should match the expanded absolute path
  const result = isPathWithinAllowedDirs(
    path.join(expandedDir, "somefile.txt"),
    ["~/.config"],
  );
  assert.equal(result, true);

  // Tilde-prefixed allowed dir should NOT match a path outside it
  const resultOutside = isPathWithinAllowedDirs("/etc/hosts", ["~/.config"]);
  assert.equal(resultOutside, false);
});

await test("isPathWithinAllowedDirs handles bare ~ as allowed dir", () => {
  const homeDir = process.env["HOME"] || process.env["USERPROFILE"] || "/root";

  const result = isPathWithinAllowedDirs(path.join(homeDir, "somefile.txt"), [
    "~",
  ]);
  assert.equal(result, true);
});

await test("validatePath expands ~ in allowed directories", async () => {
  const homeDir = process.env["HOME"] || process.env["USERPROFILE"] || "/root";
  const testDirName = `.acai-ci-tilde-expand-${Date.now()}`;
  const expandedDir = path.join(homeDir, testDirName);
  await fs.mkdir(expandedDir, { recursive: true });

  try {
    const testFile = path.join(expandedDir, "test.txt");
    await fs.writeFile(testFile, "ok");

    // Use tilde-prefixed path as allowed directory
    const resolved = await validatePath(testFile, `~/${testDirName}`);
    assert.equal(path.resolve(resolved), path.resolve(testFile));
  } finally {
    await fs.rm(expandedDir, { recursive: true, force: true });
  }
});

await test("validatePath accepts array of allowed directories", async () => {
  const testDirName = `.acai-ci-tmp-validatePath-array-${Date.now()}`;
  const dir1 = path.join(projectRoot, testDirName, "dir1");
  const dir2 = path.join(projectRoot, testDirName, "dir2");
  await fs.mkdir(dir1, { recursive: true });
  await fs.mkdir(dir2, { recursive: true });

  const fileInDir1 = path.join(dir1, "file.txt");
  await fs.writeFile(fileInDir1, "ok");

  const resolved = await validatePath(fileInDir1, [dir1, dir2]);
  assert.equal(path.resolve(resolved), path.resolve(fileInDir1));

  await fs.rm(path.join(projectRoot, testDirName), {
    recursive: true,
    force: true,
  });
});
