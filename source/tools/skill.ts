import { readdir, readFile } from "node:fs/promises";
import { z } from "zod";
import type { ActivatedSkillsTracker } from "../skills/activated-tracker.ts";
import { loadSkills } from "../skills/index.ts";
import style from "../terminal/style.ts";
import { replaceArgumentPlaceholders } from "../utils/templates.ts";
import type { ToolExecutionOptions } from "./types.ts";

export const SkillTool = {
  name: "Skill" as const,
};

const inputSchema = z.object({
  skill: z
    .string()
    .describe('The skill name. E.g., "commit", "review-pr", or "pdf"'),
  args: z.string().optional().describe("Optional arguments for the skill"),
});

type SkillInputSchema = z.infer<typeof inputSchema>;

/**
 * List resources (files and directories) in a skill directory.
 * Returns relative paths, excluding SKILL.md and hidden files.
 */
async function listSkillResources(baseDir: string): Promise<string[]> {
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    const resources: string[] = [];

    for (const entry of entries) {
      // Skip SKILL.md (already included in body)
      if (entry.name === "SKILL.md") continue;
      // Skip hidden files
      if (entry.name.startsWith(".")) continue;

      resources.push(entry.name);
    }

    // Sort for consistent output
    resources.sort();

    // Cap at 50 files to avoid overwhelming output
    return resources.slice(0, 50);
  } catch {
    // Directory read failed, return empty
    return [];
  }
}

export async function createSkillTool(
  activatedSkillsTracker: ActivatedSkillsTracker,
) {
  const skills = await loadSkills();
  const modelInvocableSkills = skills.getModelInvocable();

  const description = "Run a skill (e.g., commit, review-pr).";

  return {
    toolDef: {
      description,
      inputSchema,
    },
    display({ skill: skillName }: SkillInputSchema): string {
      return style.cyan(skillName);
    },
    async execute(
      { skill: skillName, args }: SkillInputSchema,
      { abortSignal }: ToolExecutionOptions,
    ): Promise<string> {
      try {
        if (abortSignal?.aborted) {
          throw new Error("Skill execution aborted");
        }

        // Check for deduplication
        if (activatedSkillsTracker.has(skillName)) {
          return `Skill "${skillName}" is already loaded in this session. Its instructions are available in the conversation context.`;
        }

        // Find the skill
        const skill = modelInvocableSkills.find((s) => s.name === skillName);
        if (!skill) {
          const availableSkillNames = modelInvocableSkills
            .map((s) => s.name)
            .join(", ");
          return `Skill "${skillName}" not found. Available skills: ${availableSkillNames}`;
        }

        if (skill.disableModelInvocation) {
          return `Skill "${skillName}" is not available for model invocation.`;
        }

        // Read the skill file
        const content = await readFile(skill.filePath, "utf8");

        // Parse frontmatter and body
        const yamlStart = content.indexOf("---");
        const yamlEnd = content.indexOf("---", yamlStart + 3);
        const body =
          yamlEnd !== -1 ? content.slice(yamlEnd + 3).trim() : content;

        // List resources in skill directory
        const resources = await listSkillResources(skill.baseDir);

        // Build result
        let result = `# Skill: ${skill.name}\n\n`;
        result += `**Base directory**: ${skill.baseDir}\n\n`;

        if (resources.length > 0) {
          result += "<skill_resources>\n";
          for (const resource of resources) {
            result += `${resource}\n`;
          }
          result += "</skill_resources>\n\n";
          result +=
            "Relative paths in this skill are relative to the base directory.\n\n";
        }

        const argsArray = args ? args.split(/\s+/).filter(Boolean) : [];
        result += replaceArgumentPlaceholders(body, argsArray);

        // Mark as activated
        activatedSkillsTracker.add(skillName);

        return result;
      } catch (error) {
        return (error as Error).message;
      }
    },
  };
}
