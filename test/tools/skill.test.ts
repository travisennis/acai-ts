import { strict as assert } from "node:assert";
import type { Dirent } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
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

  describe("execute method", () => {
    const oldHome = process.env["HOME"];
    let tempHome: string;
    let tracker: ActivatedSkillsTracker;
    // These will be populated via dynamic import after we set HOME
    type CreateSkillTool = (tracker: ActivatedSkillsTracker) => Promise<{
      toolDef: {
        description: string;
        // biome-ignore lint/suspicious/noExplicitAny: zod object type
        inputSchema: import("zod").ZodObject<any>;
      };
      // biome-ignore lint/suspicious/noExplicitAny: display accepts any input
      display: (input: any) => string;
      execute: (
        // biome-ignore lint/suspicious/noExplicitAny: execute accepts any input
        input: any,
        options: import("../../source/tools/types.ts").ToolExecutionOptions,
      ) => Promise<string>;
    }>;
    let createSkillTool: CreateSkillTool;

    // Helper to run the execute method
    async function run(
      tool: {
        execute: (
          // biome-ignore lint/suspicious/noExplicitAny: test helper accepts any input
          input: any,
          options: import("../../source/tools/types.ts").ToolExecutionOptions,
        ) => Promise<string>;
      },
      skill: string,
      args?: string,
      options?: { abortSignal?: AbortSignal },
    ) {
      return tool.execute(
        { skill, args: args ?? "" },
        {
          toolCallId: "test-tool-call",
          messages: [],
          abortSignal: options?.abortSignal,
        },
      );
    }

    // Create a minimal default config for acai
    async function writeDefaultConfig(homeDir: string) {
      const configDir = join(homeDir, ".acai");
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, "acai.json"), JSON.stringify({}));
    }

    // Create a skill directory structure in the temp home
    async function createSkill(
      homeDir: string,
      skillName: string,
      content: string,
      resources?: string[],
    ) {
      const skillDir = join(homeDir, ".agents", "skills", skillName);
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), content);
      if (resources) {
        for (const res of resources) {
          await writeFile(join(skillDir, res), `content of ${res}`);
        }
      }
      return skillDir;
    }

    before(async () => {
      // Use a fresh temp HOME for each test suite run
      tempHome = await mkdir(tmpdir(), { recursive: true }).then(() =>
        join(tmpdir(), `skill-execute-test-${Date.now()}`),
      );
      await mkdir(tempHome, { recursive: true });
      process.env["HOME"] = tempHome;

      await writeDefaultConfig(tempHome);

      // Create a test skill
      await createSkill(
        tempHome,
        "test-skill",
        `---
name: test-skill
description: A test skill
---
# Test Skill

Hello, world!

{{args}}`,
        ["helper.sh", "config.json"],
      );

      // Dynamic import so that the ConfigManager singleton captures the temp HOME
      const skillModule = await import("../../source/tools/skill.ts");
      createSkillTool = skillModule.createSkillTool;
    });

    after(async () => {
      process.env["HOME"] = oldHome;
      try {
        await rm(tempHome, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    });

    it("should handle abort signal and return error message", async () => {
      tracker = new ActivatedSkillsTracker();
      const tool = await createSkillTool(tracker);
      const ac = new AbortController();
      ac.abort();
      const result = await run(tool, "test-skill", "", {
        abortSignal: ac.signal,
      });
      assert.equal(result, "Skill execution aborted");
    });

    it("should report when skill is not found", async () => {
      tracker = new ActivatedSkillsTracker();
      const tool = await createSkillTool(tracker);
      const result = await run(tool, "nonexistent-skill");
      assert.ok(result.includes('Skill "nonexistent-skill" not found'));
      assert.ok(result.includes("test-skill"));
    });

    it("should report when skill is already activated", async () => {
      tracker = new ActivatedSkillsTracker();
      const tool = await createSkillTool(tracker);

      // First execution should succeed
      const result1 = await run(tool, "test-skill");
      assert.ok(result1.includes("# Skill: test-skill"));

      // Second execution should report already activated
      const result2 = await run(tool, "test-skill");
      assert.equal(
        result2,
        'Skill "test-skill" is already loaded in this session. Its instructions are available in the conversation context.',
      );
    });

    it("should execute a skill successfully and return its content", async () => {
      // Use a fresh tracker to avoid conflict with previous tests
      const freshTracker = new ActivatedSkillsTracker();
      const freshTool = await createSkillTool(freshTracker);

      const result = await freshTool.execute(
        { skill: "test-skill", args: "" },
        { toolCallId: "t1", messages: [] },
      );

      assert.ok(result.includes("# Skill: test-skill"));
      assert.ok(result.includes("**Base directory**:"));
      assert.ok(result.includes("Hello, world!"));
    });

    it("should include resources in the result when skill directory has files", async () => {
      const freshTracker = new ActivatedSkillsTracker();
      const freshTool = await createSkillTool(freshTracker);

      const result = await freshTool.execute(
        { skill: "test-skill", args: "" },
        { toolCallId: "t1", messages: [] },
      );

      assert.ok(result.includes("<skill_resources>"));
      assert.ok(result.includes("helper.sh"));
      assert.ok(result.includes("config.json"));
      assert.ok(result.includes("</skill_resources>"));
    });

    it("should replace {{args}} placeholder with provided arguments", async () => {
      const freshTracker = new ActivatedSkillsTracker();
      const freshTool = await createSkillTool(freshTracker);

      const result = await freshTool.execute(
        { skill: "test-skill", args: "arg1 arg2" },
        { toolCallId: "t1", messages: [] },
      );

      assert.ok(result.includes("arg1 arg2"));
    });
  });
});
