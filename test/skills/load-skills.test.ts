import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSkillsFromDir } from "../../source/skills/index.ts";

async function createTempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "acai-skills-test-"));
}

async function writeSkillFile(
  dir: string,
  name: string,
  description: string,
): Promise<void> {
  const content = [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "---",
  ].join("\n");
  await writeFile(join(dir, "SKILL.md"), content);
}

describe("loadSkillsFromDir", () => {
  it("should return empty array for non-existent directory", async () => {
    const dir = join(await createTempDir(), "nonexistent");
    const skills = await loadSkillsFromDir({ dir, source: "test" });
    assert.equal(skills.length, 0);
  });

  it("should return empty array for empty directory", async () => {
    const baseDir = await createTempDir();
    try {
      const skills = await loadSkillsFromDir({ dir: baseDir, source: "test" });
      assert.equal(skills.length, 0);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("should load a single skill from a subdirectory", async () => {
    const baseDir = await createTempDir();
    try {
      const skillDir = join(baseDir, "my-skill");
      await mkdir(skillDir, { recursive: true });
      await writeSkillFile(skillDir, "my-skill", "A test skill");

      const skills = await loadSkillsFromDir({ dir: baseDir, source: "test" });
      assert.equal(skills.length, 1);
      assert.equal(skills[0].name, "my-skill");
      assert.equal(skills[0].description, "A test skill");
      assert.equal(skills[0].source, "test");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("should load multiple skills from subdirectories", async () => {
    const baseDir = await createTempDir();
    try {
      const skill1Dir = join(baseDir, "skill-one");
      const skill2Dir = join(baseDir, "skill-two");
      await mkdir(skill1Dir, { recursive: true });
      await mkdir(skill2Dir, { recursive: true });
      await writeSkillFile(skill1Dir, "skill-one", "First skill");
      await writeSkillFile(skill2Dir, "skill-two", "Second skill");

      const skills = await loadSkillsFromDir({ dir: baseDir, source: "test" });
      assert.equal(skills.length, 2);
      const names = skills.map((s) => s.name).sort();
      assert.deepEqual(names, ["skill-one", "skill-two"]);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("should recursively load skills from nested subdirectories", async () => {
    const baseDir = await createTempDir();
    try {
      const skill1Dir = join(baseDir, "skill-a");
      const nestedDir = join(baseDir, "group", "skill-b");
      await mkdir(skill1Dir, { recursive: true });
      await mkdir(nestedDir, { recursive: true });
      await writeSkillFile(skill1Dir, "skill-a", "Skill A");
      await writeSkillFile(nestedDir, "skill-b", "Skill B");

      const skills = await loadSkillsFromDir({ dir: baseDir, source: "test" });
      assert.equal(skills.length, 2);
      const names = skills.map((s) => s.name).sort();
      assert.deepEqual(names, ["skill-a", "skill-b"]);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("should skip hidden directories", async () => {
    const baseDir = await createTempDir();
    try {
      const visibleDir = join(baseDir, "visible-skill");
      const hiddenDir = join(baseDir, ".hidden");
      await mkdir(visibleDir, { recursive: true });
      await mkdir(hiddenDir, { recursive: true });
      await writeSkillFile(visibleDir, "visible-skill", "Visible skill");
      await writeSkillFile(hiddenDir, "hidden", "Hidden skill");

      const skills = await loadSkillsFromDir({ dir: baseDir, source: "test" });
      assert.equal(skills.length, 1);
      assert.equal(skills[0].name, "visible-skill");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("should skip files that are not SKILL.md", async () => {
    const baseDir = await createTempDir();
    try {
      const skillDir = join(baseDir, "my-skill");
      await mkdir(skillDir, { recursive: true });
      await writeSkillFile(skillDir, "my-skill", "A test skill");
      // Create a non-SKILL.md file that should be ignored
      await writeFile(join(baseDir, "README.md"), "Not a skill");

      const skills = await loadSkillsFromDir({ dir: baseDir, source: "test" });
      assert.equal(skills.length, 1);
      assert.equal(skills[0].name, "my-skill");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("should handle symlink cycles gracefully", async () => {
    const baseDir = await createTempDir();
    try {
      const realDir = join(baseDir, "real-skill");
      const linkDir = join(baseDir, "link-to-real");
      await mkdir(realDir, { recursive: true });
      await writeSkillFile(realDir, "real-skill", "Real skill");
      // Create a symlink to create a potential cycle
      await symlink(realDir, linkDir);
      // Create a symlink back to base to form a cycle
      const cycleDir = join(baseDir, "cycle");
      await mkdir(cycleDir, { recursive: true });
      await symlink(baseDir, join(cycleDir, "back-to-root"));

      const skills = await loadSkillsFromDir({ dir: baseDir, source: "test" });
      // Should still find the real skill, and not crash on the cycle
      assert.ok(skills.length >= 1);
      assert.ok(skills.some((s) => s.name === "real-skill"));
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("should handle invalid SKILL.md (missing name)", async () => {
    const baseDir = await createTempDir();
    try {
      const skillDir = join(baseDir, "bad-skill");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "SKILL.md"),
        "---\ndescription: No name here\n---",
      );

      const skills = await loadSkillsFromDir({ dir: baseDir, source: "test" });
      assert.equal(skills.length, 0);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("should handle invalid SKILL.md (missing description)", async () => {
    const baseDir = await createTempDir();
    try {
      const skillDir = join(baseDir, "no-desc");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "SKILL.md"),
        "---\nname: no-desc\n---",
      );

      const skills = await loadSkillsFromDir({ dir: baseDir, source: "test" });
      assert.equal(skills.length, 0);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("should handle name that doesn't match directory name", async () => {
    const baseDir = await createTempDir();
    try {
      const skillDir = join(baseDir, "actual-name");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "SKILL.md"),
        "---\nname: different-name\ndescription: Name mismatch\n---",
      );

      const skills = await loadSkillsFromDir({ dir: baseDir, source: "test" });
      assert.equal(skills.length, 0);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("should handle subdir parameter to start from a subdirectory", async () => {
    const baseDir = await createTempDir();
    try {
      const groupDir = join(baseDir, "group");
      const skillDir = join(groupDir, "sub-skill");
      await mkdir(skillDir, { recursive: true });
      await writeSkillFile(skillDir, "sub-skill", "Nested skill");

      const skills = await loadSkillsFromDir(
        { dir: baseDir, source: "test" },
        "group",
      );
      assert.equal(skills.length, 1);
      assert.equal(skills[0].name, "sub-skill");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });
});
