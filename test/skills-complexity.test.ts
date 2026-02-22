import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadSkillsFromDir } from "../source/skills/index.ts";

const TEST_TEMP_BASE = path.join(os.tmpdir(), "acai-test-skills");

async function createTestDir(): Promise<string> {
  const testId = `skills-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = path.join(TEST_TEMP_BASE, testId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function cleanupTestDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

function createSkillMarkdown(name: string, description: string): string {
  return `---
name: ${name}
description: ${description}
user-invocable: true
disable-model-invocation: false
---

# ${name} Skill
`;
}

test.describe("loadSkillsFromDirInternal - complexity refactoring tests", () => {
  test("should skip hidden files and directories", async () => {
    const dir = await createTestDir();
    try {
      // Create a hidden directory
      await fs.mkdir(path.join(dir, ".hidden-skill"));
      await fs.writeFile(
        path.join(dir, ".hidden-skill", "SKILL.md"),
        createSkillMarkdown(".hidden-skill", "Hidden skill"),
      );

      // Create a hidden file
      await fs.writeFile(
        path.join(dir, ".hidden-file.md"),
        createSkillMarkdown("hidden", "Should not be loaded"),
      );

      // Create a valid skill
      await fs.mkdir(path.join(dir, "valid-skill"));
      await fs.writeFile(
        path.join(dir, "valid-skill", "SKILL.md"),
        createSkillMarkdown("valid-skill", "Valid skill"),
      );

      const skills = await loadSkillsFromDir({ dir, source: "user" });

      assert.equal(skills.length, 1);
      assert.equal(skills[0]?.name, "valid-skill");
    } finally {
      await cleanupTestDir(dir);
    }
  });

  test("should skip symbolic links", async () => {
    const dir = await createTestDir();
    try {
      const realDir = path.join(dir, "real-skill");
      await fs.mkdir(realDir);
      await fs.writeFile(
        path.join(realDir, "SKILL.md"),
        createSkillMarkdown("real-skill", "Real skill"),
      );

      // Create a symlink
      await fs.symlink(realDir, path.join(dir, "link-skill"));

      const skills = await loadSkillsFromDir({ dir, source: "user" });

      // Should only load the real skill, not the symlink
      assert.equal(skills.length, 1);
      assert.equal(skills[0]?.name, "real-skill");
    } finally {
      await cleanupTestDir(dir);
    }
  });

  test("should skip skills with invalid name", async () => {
    const dir = await createTestDir();
    try {
      // Create skill with name containing invalid characters
      await fs.mkdir(path.join(dir, "invalid-skill"));
      await fs.writeFile(
        path.join(dir, "invalid-skill", "SKILL.md"),
        `---
name: Invalid Skill!
description: Invalid name characters
---

# Invalid Skill
`,
      );

      // Create valid skill
      await fs.mkdir(path.join(dir, "valid-skill"));
      await fs.writeFile(
        path.join(dir, "valid-skill", "SKILL.md"),
        createSkillMarkdown("valid-skill", "Valid skill"),
      );

      const skills = await loadSkillsFromDir({ dir, source: "user" });

      assert.equal(skills.length, 1);
      assert.equal(skills[0]?.name, "valid-skill");
    } finally {
      await cleanupTestDir(dir);
    }
  });

  test("should skip skills with invalid description", async () => {
    const dir = await createTestDir();
    try {
      // Create skill with empty description
      await fs.mkdir(path.join(dir, "no-desc-skill"));
      await fs.writeFile(
        path.join(dir, "no-desc-skill", "SKILL.md"),
        `---
name: no-desc-skill
description: 
---

# No Description Skill
`,
      );

      // Create valid skill
      await fs.mkdir(path.join(dir, "valid-skill"));
      await fs.writeFile(
        path.join(dir, "valid-skill", "SKILL.md"),
        createSkillMarkdown("valid-skill", "Valid skill"),
      );

      const skills = await loadSkillsFromDir({ dir, source: "user" });

      assert.equal(skills.length, 1);
      assert.equal(skills[0]?.name, "valid-skill");
    } finally {
      await cleanupTestDir(dir);
    }
  });

  test("should load valid skills with all fields", async () => {
    const dir = await createTestDir();
    try {
      await fs.mkdir(path.join(dir, "full-skill"));
      await fs.writeFile(
        path.join(dir, "full-skill", "SKILL.md"),
        `---
name: full-skill
description: A skill with all fields
user-invocable: true
disable-model-invocation: false
allowed-tools: bash,read
arguments: --arg1 <value>
examples:
  - example 1
  - example 2
---

# Full Skill
`,
      );

      const skills = await loadSkillsFromDir({ dir, source: "user" });

      assert.equal(skills.length, 1);
      const skill = skills[0];
      assert.equal(skill.name, "full-skill");
      assert.equal(skill.description, "A skill with all fields");
      assert.equal(skill.userInvocable, true);
      assert.equal(skill.disableModelInvocation, false);
      assert.equal(skill.allowedTools, "bash,read");
      assert.equal(skill.arguments, "--arg1 <value>");
      assert.deepEqual(skill.examples, ["example 1", "example 2"]);
      assert.equal(skill.source, "user");
    } finally {
      await cleanupTestDir(dir);
    }
  });

  test("should load skills from nested directories recursively", async () => {
    const dir = await createTestDir();
    try {
      // Create nested structure: dir/parent/child/skill
      await fs.mkdir(path.join(dir, "parent", "child"), { recursive: true });
      await fs.writeFile(
        path.join(dir, "parent", "child", "SKILL.md"),
        createSkillMarkdown("child", "Nested skill"),
      );

      // Create skill at root level
      await fs.mkdir(path.join(dir, "root-skill"));
      await fs.writeFile(
        path.join(dir, "root-skill", "SKILL.md"),
        createSkillMarkdown("root-skill", "Root skill"),
      );

      const skills = await loadSkillsFromDir({ dir, source: "user" });

      assert.equal(skills.length, 2);
      const skillNames = skills.map((s) => s.name).sort();
      assert.deepEqual(skillNames, ["child", "root-skill"]);
    } finally {
      await cleanupTestDir(dir);
    }
  });

  test("should handle missing SKILL.md gracefully", async () => {
    const dir = await createTestDir();
    try {
      // Create directory without SKILL.md
      await fs.mkdir(path.join(dir, "empty-skill"));
      await fs.writeFile(
        path.join(dir, "empty-skill", "README.md"),
        "Just a readme",
      );

      // Create valid skill
      await fs.mkdir(path.join(dir, "valid-skill"));
      await fs.writeFile(
        path.join(dir, "valid-skill", "SKILL.md"),
        createSkillMarkdown("valid-skill", "Valid skill"),
      );

      const skills = await loadSkillsFromDir({ dir, source: "user" });

      assert.equal(skills.length, 1);
      assert.equal(skills[0]?.name, "valid-skill");
    } finally {
      await cleanupTestDir(dir);
    }
  });

  test("should handle non-existent directory gracefully", async () => {
    const dir = path.join(os.tmpdir(), "non-existent-dir-12345");
    const skills = await loadSkillsFromDir({ dir, source: "user" });

    assert.equal(skills.length, 0);
  });

  test("should correctly set baseDir for nested skills", async () => {
    const dir = await createTestDir();
    try {
      await fs.mkdir(path.join(dir, "parent", "child"), { recursive: true });
      await fs.writeFile(
        path.join(dir, "parent", "child", "SKILL.md"),
        createSkillMarkdown("child", "Nested skill"),
      );

      const skills = await loadSkillsFromDir({ dir, source: "user" });

      assert.equal(skills.length, 1);
      // baseDir should be the directory containing SKILL.md
      assert.ok(skills[0]?.baseDir.endsWith(path.join("parent", "child")));
    } finally {
      await cleanupTestDir(dir);
    }
  });

  test("should use source parameter correctly", async () => {
    const dir = await createTestDir();
    try {
      await fs.mkdir(path.join(dir, "test-skill"));
      await fs.writeFile(
        path.join(dir, "test-skill", "SKILL.md"),
        createSkillMarkdown("test-skill", "Test skill"),
      );

      const skills = await loadSkillsFromDir({ dir, source: "project" });

      assert.equal(skills.length, 1);
      assert.equal(skills[0]?.source, "project");
    } finally {
      await cleanupTestDir(dir);
    }
  });
});
