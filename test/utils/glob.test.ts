import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { glob } from "../../source/utils/glob.ts";

const write = async (p: string, data = "") => {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, data);
};

const touch = write;

const dir = async (p: string) => {
  await fs.mkdir(p, { recursive: true });
};

const list = (arr: string[]) => arr.map((p) => p.split(path.sep).join("/"));

describe("utils/glob", () => {
  let tmpRoot: string;

  before(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "acai-glob-"));
  });

  after(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  const makeCaseDir = async (): Promise<string> =>
    fs.mkdtemp(path.join(tmpRoot, "case-"));

  it("respects .gitignore with leading slash at root", async () => {
    const tmpDir = await makeCaseDir();
    try {
      await write(path.join(tmpDir, ".gitignore"), "/*.c\n");
      await touch(path.join(tmpDir, "a.c"));
      await dir(path.join(tmpDir, "src"));
      await touch(path.join(tmpDir, "src", "b.c"));

      const res = await glob("**/*.c", { cwd: tmpDir, gitignore: true });
      assert.deepEqual(list(res).sort(), ["src/b.c"]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("respects directory ignores with trailing slash", async () => {
    const tmpDir = await makeCaseDir();
    try {
      await write(path.join(tmpDir, ".gitignore"), "build/\n");
      await dir(path.join(tmpDir, "build", "deep"));
      await touch(path.join(tmpDir, "build", "deep", "x.txt"));
      await touch(path.join(tmpDir, "keep.txt"));

      const res = await glob(["**/*"], { cwd: tmpDir, gitignore: true });
      const items = new Set(list(res));
      assert(items.has("keep.txt"));
      assert(!items.has("build/deep/x.txt"));
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("supports negation in nested .gitignore", async () => {
    const tmpDir = await makeCaseDir();
    try {
      await write(path.join(tmpDir, ".gitignore"), "*.log\n");
      await write(path.join(tmpDir, "src", ".gitignore"), "!keep.log\n");
      await touch(path.join(tmpDir, "src", "keep.log"));
      await touch(path.join(tmpDir, "src", "other.log"));

      const res = await glob(["src/*.log"], { cwd: tmpDir, gitignore: true });
      assert.deepEqual(list(res).sort(), ["src/keep.log"]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles escaped space and escaped # in .gitignore", async () => {
    const tmpDir = await makeCaseDir();
    try {
      await write(
        path.join(tmpDir, ".gitignore"),
        String.raw`foo\ bar.txt
\#note.txt
`,
      );
      await touch(path.join(tmpDir, "foo bar.txt"));
      await touch(path.join(tmpDir, "#note.txt"));
      await touch(path.join(tmpDir, "keep.txt"));

      const res = await glob(["**/*"], { cwd: tmpDir, gitignore: true });
      const items = new Set(list(res));
      assert(items.has("keep.txt"));
      assert(!items.has("foo bar.txt"));
      assert(!items.has("#note.txt"));
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("applies user negative patterns", async () => {
    const tmpDir = await makeCaseDir();
    try {
      await touch(path.join(tmpDir, "a.md"));
      await touch(path.join(tmpDir, "a.ts"));
      await touch(path.join(tmpDir, "b.md"));

      const res = await glob(["**/*", "!**/*.md"], {
        cwd: tmpDir,
        gitignore: true,
      });
      assert.deepEqual(list(res).sort(), ["a.ts"]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
