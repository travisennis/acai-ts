import { strict as assert } from "node:assert";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  formatSkillsForPrompt,
  type LoadSkillsOptions,
  loadSkills,
  type Skill,
} from "../source/skills/index.ts";

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: "test-skill",
    description: "A test skill",
    filePath: "/tmp/test-skill/SKILL.md",
    baseDir: "/tmp/test-skill",
    source: "user",
    userInvocable: true,
    disableModelInvocation: false,
    ...overrides,
  };
}

describe("formatSkillsForPrompt", () => {
  it("should include model-invocable skills", () => {
    const skills = [makeSkill({ name: "my-skill" })];
    const result = formatSkillsForPrompt(skills);

    assert.ok(result.includes("my-skill"));
    assert.ok(result.includes("<available_skills>"));
  });

  it("should exclude skills with disableModelInvocation: true", () => {
    const skills = [
      makeSkill({ name: "visible", disableModelInvocation: false }),
      makeSkill({ name: "hidden", disableModelInvocation: true }),
    ];
    const result = formatSkillsForPrompt(skills);

    assert.ok(result.includes("visible"));
    assert.ok(!result.includes("hidden"));
  });

  it("should return empty string when all skills have disableModelInvocation: true", () => {
    const skills = [
      makeSkill({ name: "doc-only", disableModelInvocation: true }),
    ];
    const result = formatSkillsForPrompt(skills);

    assert.equal(result, "");
  });

  it("should return empty string for empty skills array", () => {
    const result = formatSkillsForPrompt([]);
    assert.equal(result, "");
  });

  it("should include user-invocable: false skills that are model-invocable", () => {
    const skills = [
      makeSkill({
        name: "model-only",
        userInvocable: false,
        disableModelInvocation: false,
      }),
    ];
    const result = formatSkillsForPrompt(skills);

    assert.ok(result.includes("model-only"));
  });
});

describe("loadSkills priority", () => {
  const tmpDir = join("/tmp", "acai-skill-priority-test");
  const agentsGlobalDir = join(tmpDir, "agents-global");
  const configDir = join(tmpDir, "config-skills");
  const agentsProjectDir = join(tmpDir, "agents-project");
  const claudeUserDir = join(tmpDir, "claude-user");
  const claudeProjectDir = join(tmpDir, "claude-project");
  const codexUserDir = join(tmpDir, "codex-user");

  async function createSkill(
    dir: string,
    name: string,
    description: string,
  ): Promise<void> {
    const skillDir = join(dir, name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${description}\n---\n`,
    );
  }

  before(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(agentsGlobalDir, { recursive: true });
    await mkdir(configDir, { recursive: true });
    await mkdir(agentsProjectDir, { recursive: true });
    await mkdir(claudeUserDir, { recursive: true });
    await mkdir(claudeProjectDir, { recursive: true });
    await mkdir(codexUserDir, { recursive: true });

    // Same skill name in all sources
    await createSkill(codexUserDir, "shared-skill", "codex-user version");
    await createSkill(claudeUserDir, "shared-skill", "claude-user version");
    await createSkill(agentsGlobalDir, "shared-skill", "user version");
    await createSkill(configDir, "shared-skill", "config version");
    await createSkill(
      claudeProjectDir,
      "shared-skill",
      "claude-project version",
    );
    await createSkill(agentsProjectDir, "shared-skill", "project version");

    // Unique skills to verify each source loads
    await createSkill(codexUserDir, "codex-user-only", "codex user only");
    await createSkill(claudeUserDir, "claude-user-only", "claude user only");
    await createSkill(agentsGlobalDir, "user-only", "user only");
    await createSkill(configDir, "config-only", "config only");
    await createSkill(
      claudeProjectDir,
      "claude-project-only",
      "claude project only",
    );
    await createSkill(agentsProjectDir, "project-only", "project only");
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("project skills override all other sources when names collide", async () => {
    const options: LoadSkillsOptions = {
      additionalSkillPaths: [configDir],
      dirs: {
        codexUser: codexUserDir,
        claudeUser: claudeUserDir,
        claudeProject: claudeProjectDir,
        agentsGlobal: agentsGlobalDir,
        agentsProject: agentsProjectDir,
      },
    };
    const skills = await loadSkills(options);
    const shared = skills.getAll().find((s) => s.name === "shared-skill");
    assert.ok(shared, "shared-skill should exist");
    assert.equal(shared.description, "project version");
    assert.equal(shared.source, "project");
  });

  it("config skills override user skills when no project override exists", async () => {
    const options: LoadSkillsOptions = {
      additionalSkillPaths: [configDir],
      dirs: {
        codexUser: codexUserDir,
        claudeUser: claudeUserDir,
        agentsGlobal: agentsGlobalDir,
        // No project dirs
      },
    };
    const skills = await loadSkills(options);
    const shared = skills.getAll().find((s) => s.name === "shared-skill");
    assert.ok(shared, "shared-skill should exist");
    assert.equal(shared.description, "config version");
    assert.equal(shared.source, "config");
  });

  it("all sources contribute unique skills", async () => {
    const options: LoadSkillsOptions = {
      additionalSkillPaths: [configDir],
      dirs: {
        codexUser: codexUserDir,
        claudeUser: claudeUserDir,
        claudeProject: claudeProjectDir,
        agentsGlobal: agentsGlobalDir,
        agentsProject: agentsProjectDir,
      },
    };
    const skills = await loadSkills(options);
    const names = skills.getAll().map((s) => s.name);
    assert.ok(names.includes("codex-user-only"));
    assert.ok(names.includes("claude-user-only"));
    assert.ok(names.includes("user-only"));
    assert.ok(names.includes("config-only"));
    assert.ok(names.includes("claude-project-only"));
    assert.ok(names.includes("project-only"));
  });
});
