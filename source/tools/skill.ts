import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
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

export async function createSkillTool() {
  const skills = await loadSkills();

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

        // Find the skill
        const skill = skills.find((s) => s.name === skillName);
        if (!skill) {
          const availableSkillNames = skills.map((s) => s.name).join(", ");
          const errorMsg = `Skill "${skillName}" not found. Available skills: ${availableSkillNames}`;
          return errorMsg;
        }

        if (skill.disableModelInvocation) {
          return `Skill "${skillName}" is not available for model invocation.`;
        }

        // Read the skill file
        const content = await readFile(skill.filePath, "utf8");

        let result = `# Skill Name: ${skill.name}`;
        result += `\n**Base directory**: ${dirname(skill.filePath)}\n\n`;
        result +=
          "Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.\n";

        // Parse frontmatter and body
        const yamlStart = content.indexOf("---");
        const yamlEnd = content.indexOf("---", yamlStart + 3);
        const body =
          yamlEnd !== -1 ? content.slice(yamlEnd + 3).trim() : content;

        const argsArray = args ? args.split(/\s+/).filter(Boolean) : [];
        result += replaceArgumentPlaceholders(body, argsArray);

        return result;
      } catch (error) {
        const errorMsg = `${(error as Error).message}`;
        return errorMsg;
      }
    },
  };
}
