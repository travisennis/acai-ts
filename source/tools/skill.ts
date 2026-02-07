import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { loadSkills } from "../skills.ts";
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

  const description = `Execute a skill within the main conversation

<skills_instructions>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge. The documentation this tool returns will tell you how to use that skill to complete your task.

How to invoke:
- Use this tool with the skill name and optional arguments
- Examples:
  - \`skill: "pdf"\` - invoke the pdf skill
  - \`skill: "commit", args: "-m 'Fix bug'"\` - invoke with arguments
  - \`skill: "review-pr", args: "123"\` - invoke with arguments
  - \`skill: "ms-office-suite:pdf"\` - invoke using fully qualified name

Important:
- When a skill is relevant, you must invoke this tool IMMEDIATELY as your first action
- NEVER just announce or mention a skill in your text response without actually calling this tool
- This is a BLOCKING REQUIREMENT: invoke the relevant Skill tool BEFORE generating any other response about the task
</skills_instructions>`;

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
