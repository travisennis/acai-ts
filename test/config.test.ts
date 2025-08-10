import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ConfigManager, DirectoryProvider } from "../source/config.ts";

// Helper to create and cleanup a temp directory
async function withTempDir<T>(fn: (dir: string) => Promise<T>) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "acai-test-"));
  try {
    return await fn(tmp);
  } finally {
    // best-effort cleanup
    try {
      await fs.rm(tmp, { recursive: true, force: true });
    } catch {}
  }
}

test("DirectoryProvider.ensurePath async and sync create directories", async () => {
  await withTempDir(async (tmp) => {
    const base = path.join(tmp, "base");
    const dp = new DirectoryProvider(base);

    const asyncDir = await dp.ensurePath("async-sub");
    const stat = await fs.stat(asyncDir);
    assert(stat.isDirectory(), "async-created path should be a directory");

    const syncDir = dp.ensurePathSync("sync-sub");
    const stat2 = await fs.stat(syncDir);
    assert(stat2.isDirectory(), "sync-created path should be a directory");
  });
});

test("ConfigManager.ensureAppConfig creates default app config in HOME", async () => {
  await withTempDir(async (tmpHome) => {
    const oldHome = process.env.HOME;
    try {
      process.env.HOME = tmpHome;

      const mgr = new ConfigManager();
      const cfg = await mgr.ensureAppConfig("acai");

      // Defaults expected
      assert.equal((cfg as Record<string, unknown>).notify, true);
      assert.equal(
        ((cfg as Record<string, unknown>).tools as Record<string, unknown>)
          .maxTokens as number,
        30000,
      );

      const configPath = path.join(tmpHome, ".acai", "acai.json");
      const data = JSON.parse(await fs.readFile(configPath, "utf8"));
      assert.equal(data.notify, true);
      assert.equal(data.tools.maxTokens, 30000);
    } finally {
      if (oldHome !== undefined) process.env.HOME = oldHome;
    }
  });
});

test("writeProjectLearnedRulesFile creates project rules file inside .acai", async () => {
  await withTempDir(async (tmpProject) => {
    const oldCwd = process.cwd();
    try {
      process.chdir(tmpProject);
      const mgr = new ConfigManager();

      await mgr.writeProjectLearnedRulesFile("# rules\nhello");

      const target = path.join(
        tmpProject,
        ".acai",
        "rules",
        "learned-rules.md",
      );
      const content = await fs.readFile(target, "utf8");
      assert(content.includes("hello"));

      // readProjectLearnedRulesFile should return the same content
      const read = await mgr.readProjectLearnedRulesFile();
      assert(read.includes("hello"));
    } finally {
      process.chdir(oldCwd);
    }
  });
});

test("writeCachedLearnedRulesFile and readCachedLearnedRulesFile in HOME", async () => {
  await withTempDir(async (tmpHome) => {
    const oldHome = process.env.HOME;
    try {
      process.env.HOME = tmpHome;
      const mgr = new ConfigManager();

      await mgr.writeCachedLearnedRulesFile("cached rules\nabc");
      const content = await mgr.readCachedLearnedRulesFile();
      assert(content.includes("abc"));

      // Removing file should cause read to return empty string
      const filePath = path.join(tmpHome, ".acai", "rules", "learned-rules.md");
      await fs.rm(filePath);
      const missing = await mgr.readCachedLearnedRulesFile();
      assert.equal(missing, "");
    } finally {
      if (oldHome !== undefined) process.env.HOME = oldHome;
    }
  });
});

test("readAppConfig returns {} for missing and throws for malformed", async () => {
  await withTempDir(async (tmpHome) => {
    const oldHome = process.env.HOME;
    try {
      process.env.HOME = tmpHome;
      const mgr = new ConfigManager();

      const missing = await mgr.readAppConfig("nonexistent");
      assert.deepEqual(missing, {});

      // Create malformed JSON
      const cfgDir = path.join(tmpHome, ".acai");
      await fs.mkdir(cfgDir, { recursive: true });
      const cfgPath = path.join(cfgDir, "bad.json");
      await fs.writeFile(cfgPath, "{ invalid json", "utf8");

      let threw = false;
      try {
        await mgr.readAppConfig("bad");
      } catch (_e) {
        threw = true;
      }
      assert.equal(threw, true, "readAppConfig should throw on malformed JSON");
    } finally {
      if (oldHome !== undefined) process.env.HOME = oldHome;
    }
  });
});

test("readProjectConfig merges app and project configs with project precedence", async () => {
  await withTempDir(async (tmpHome) => {
    const oldHome = process.env.HOME;
    const oldCwd = process.cwd();
    try {
      process.env.HOME = tmpHome;
      const projectDir = path.join(tmpHome, "proj");
      await fs.mkdir(projectDir, { recursive: true });
      process.chdir(projectDir);

      // write app config in HOME
      const appCfgDir = path.join(tmpHome, ".acai");
      await fs.mkdir(appCfgDir, { recursive: true });
      const appCfg = { tools: { maxTokens: 100 }, notify: true };
      await fs.writeFile(
        path.join(appCfgDir, "acai.json"),
        JSON.stringify(appCfg),
        "utf8",
      );

      // write project config overriding tools.maxTokens and notify
      const projCfgDir = path.join(projectDir, ".acai");
      await fs.mkdir(path.join(projCfgDir), { recursive: true });
      const projCfg = { tools: { maxTokens: 50 }, notify: false };
      await fs.writeFile(
        path.join(projCfgDir, "acai.json"),
        JSON.stringify(projCfg),
        "utf8",
      );

      const mgr = new ConfigManager();
      const merged = await mgr.readProjectConfig();
      assert.equal(merged.tools.maxTokens, 50);
      assert.equal(merged.notify, false);
    } finally {
      if (oldHome !== undefined) process.env.HOME = oldHome;
      process.chdir(oldCwd);
    }
  });
});

test("readAgentsFile and writeAgentsFile operate in CWD", async () => {
  await withTempDir(async (tmpCwd) => {
    const oldCwd = process.cwd();
    try {
      process.chdir(tmpCwd);
      const mgr = new ConfigManager();

      const initial = await mgr.readAgentsFile();
      assert.equal(initial, "");

      await mgr.writeAgentsFile("# Agents\nagent1");
      const content = await mgr.readAgentsFile();
      assert(content.includes("agent1"));
    } finally {
      process.chdir(oldCwd);
    }
  });
});
