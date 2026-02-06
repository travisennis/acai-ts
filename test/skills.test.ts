import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { formatSkillsForPrompt, type Skill } from "../source/skills.ts";

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
