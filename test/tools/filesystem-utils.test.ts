import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { validatePath } from "../../source/tools/filesystem-utils.ts";

const projectRoot = process.cwd();

await test("validatePath allows the allowedDirectory itself", async () => {
  const allowed = projectRoot;
  const resolved = await validatePath(allowed, allowed);
  assert.equal(path.resolve(resolved), path.resolve(allowed));
});

await test("validatePath allows descendants of allowedDirectory", async () => {
  const allowed = projectRoot;
  const dir = path.join(allowed, ".acai-ci-tmp-validatePath");
  const file = path.join(dir, "child.txt");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, "ok");
  const resolved = await validatePath(file, allowed);
  assert.equal(path.resolve(resolved), path.resolve(file));
  await fs.rm(dir, { recursive: true, force: true });
});

await test("validatePath rejects paths outside allowedDirectory", async () => {
  const allowed = path.join(projectRoot, "sub-allowed");
  await fs.mkdir(allowed, { recursive: true });
  const outside = path.join(projectRoot, "..", "outside.txt");
  let threw = false;
  try {
    await validatePath(outside, allowed);
  } catch (_err) {
    threw = true;
  }
  assert.equal(threw, true);
  await fs.rm(allowed, { recursive: true, force: true });
});
