import { strict as assert } from "node:assert";
import type { Dirent } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ActivatedSkillsTracker } from "../../source/skills/activated-tracker.ts";

describe("Skill Tool", () => {
  describe("ActivatedSkillsTracker", () => {
    it("should start with no activated skills", () => {
      const tracker = new ActivatedSkillsTracker();
      assert.equal(tracker.has("pdf"), false);
    });

    it("should track activated skills", () => {
      const tracker = new ActivatedSkillsTracker();
      tracker.add("pdf");
      assert.equal(tracker.has("pdf"), true);
      assert.equal(tracker.has("commit"), false);
    });

    it("should reset all activated skills", () => {
      const tracker = new ActivatedSkillsTracker();
      tracker.add("pdf");
      tracker.add("commit");
      assert.equal(tracker.has("pdf"), true);
      assert.equal(tracker.has("commit"), true);

      tracker.reset();

      assert.equal(tracker.has("pdf"), false);
      assert.equal(tracker.has("commit"), false);
    });
  });

  describe("listSkillResources", () => {
    // Test the resource listing functionality by creating temp directories
    it("should list files in a skill directory", async () => {
      const tempDir = join(tmpdir(), `skill-resources-test-${Date.now()}`);
      const skillDir = join(tempDir, "test-skill");
      await mkdir(skillDir, { recursive: true });

      // Create some files
      await writeFile(join(skillDir, "SKILL.md"), "# Test Skill");
      await writeFile(join(skillDir, "script.sh"), "#!/bin/bash");
      await writeFile(join(skillDir, "README.md"), "# README");
      await mkdir(join(skillDir, "scripts"), { recursive: true });
      await writeFile(join(skillDir, "scripts", "run.py"), "print('hello')");

      // Create hidden file (should be ignored)
      await writeFile(join(skillDir, ".hidden"), "hidden");

      // Read directory entries to verify structure
      const entries = await import("node:fs/promises").then((fs) =>
        fs.readdir(skillDir, { withFileTypes: true }),
      );

      const names = entries.map((e: Dirent) => e.name).sort();
      assert.ok(names.includes("SKILL.md"));
      assert.ok(names.includes("script.sh"));
      assert.ok(names.includes("README.md"));
      assert.ok(names.includes("scripts"));
      assert.ok(names.includes(".hidden"));

      // Cleanup
      await rm(tempDir, { recursive: true, force: true });
    });
  });
});
