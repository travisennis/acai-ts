import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { validatePath } from "../../../source/utils/filesystem/security.ts";
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
