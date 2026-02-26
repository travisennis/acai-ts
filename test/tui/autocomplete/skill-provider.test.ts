import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { Skill } from "../../../source/skills/index.ts";
import { SkillProvider } from "../../../source/tui/autocomplete/skill-provider.ts";

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

describe("SkillProvider", () => {
  describe("constructor", () => {
    it("should accept all provided skills", async () => {
      const skills = [
        makeSkill({ name: "user-skill", userInvocable: true }),
        makeSkill({ name: "model-only", userInvocable: false }),
      ];
      const provider = new SkillProvider(skills);
      const result = await provider.getSuggestions([">"], 0, 1);

      assert.equal(result?.items.length, 2);
    });

    it("should return empty items when skills array is empty", async () => {
      const provider = new SkillProvider([]);
      const result = await provider.getSuggestions([">"], 0, 1);
      assert.deepEqual(result, { items: [], prefix: "" });
    });
  });

  describe("getSuggestions", () => {
    it("should return null when not in skill context", async () => {
      const skills = [makeSkill({ name: "test-skill" })];
      const provider = new SkillProvider(skills);

      const result = await provider.getSuggestions(["hello"], 0, 5);
      assert.equal(result, null);
    });

    it("should return all skills when just '>' is typed", async () => {
      const skills = [
        makeSkill({ name: "zebra-skill" }),
        makeSkill({ name: "alpha-skill" }),
        makeSkill({ name: "beta-skill" }),
      ];
      const provider = new SkillProvider(skills);

      // ">" at start of line
      const result = await provider.getSuggestions([">"], 0, 1);

      assert.ok(result !== null);
      assert.equal(result?.items.length, 3);
      assert.equal(result?.items[0].label, "alpha-skill"); // Sorted alphabetically
      assert.equal(result?.prefix, "");
    });

    it("should return all skills when '>' is typed after whitespace", async () => {
      const skills = [makeSkill({ name: "test-skill" })];
      const provider = new SkillProvider(skills);

      const result = await provider.getSuggestions(["hello >"], 0, 7);

      assert.ok(result !== null);
      assert.equal(result?.items.length, 1);
      assert.equal(result?.items[0].value, "`test-skill` skill");
    });

    it("should filter skills by prefix when typing after '>'", async () => {
      const skills = [
        makeSkill({ name: "commit" }),
        makeSkill({ name: "create-pr" }),
        makeSkill({ name: "pdf" }),
      ];
      const provider = new SkillProvider(skills);

      const result = await provider.getSuggestions([">c"], 0, 2);

      assert.ok(result !== null);
      assert.equal(result?.items.length, 2);
      assert.equal(result?.prefix, "c");
      assert.ok(result?.items.some((i) => i.value === "`commit` skill"));
      assert.ok(result?.items.some((i) => i.value === "`create-pr` skill"));
    });

    it("should return null when no skills match prefix", async () => {
      const skills = [makeSkill({ name: "commit" })];
      const provider = new SkillProvider(skills);

      const result = await provider.getSuggestions([">xyz"], 0, 4);

      assert.equal(result, null);
    });
  });

  describe("applyCompletion", () => {
    it("should strip '>' trigger and insert skill value", () => {
      const provider = new SkillProvider([makeSkill({ name: "test-skill" })]);

      const result = provider.applyCompletion(
        [">"],
        0,
        1,
        { value: "`test-skill` skill", label: "test-skill" },
        "",
      );

      assert.equal(result.lines[0], "`test-skill` skill");
      assert.equal(result.cursorCol, 18);
    });

    it("should strip '>' trigger and replace partial prefix", () => {
      const provider = new SkillProvider([makeSkill({ name: "commit" })]);

      const result = provider.applyCompletion(
        [">c"],
        0,
        2,
        { value: "`commit` skill", label: "commit" },
        "c",
      );

      assert.equal(result.lines[0], "`commit` skill");
      assert.equal(result.cursorCol, 14);
    });

    it("should preserve text before '>' trigger", () => {
      const provider = new SkillProvider([makeSkill({ name: "commit" })]);

      const result = provider.applyCompletion(
        ["hello >c"],
        0,
        8,
        { value: "`commit` skill", label: "commit" },
        "c",
      );

      assert.equal(result.lines[0], "hello `commit` skill");
      assert.equal(result.cursorCol, 20);
    });

    it("should preserve text after cursor", () => {
      const provider = new SkillProvider([makeSkill({ name: "commit" })]);

      const result = provider.applyCompletion(
        [">c some text"],
        0,
        2,
        { value: "`commit` skill", label: "commit" },
        "c",
      );

      assert.equal(result.lines[0], "`commit` skill some text");
    });

    it("should return unchanged when not in skill context", () => {
      const provider = new SkillProvider([makeSkill({ name: "test-skill" })]);

      const result = provider.applyCompletion(
        ["hello"],
        0,
        5,
        { value: "`test-skill` skill", label: "test-skill" },
        "",
      );

      assert.equal(result.lines[0], "hello");
      assert.equal(result.cursorCol, 5);
    });
  });
});
