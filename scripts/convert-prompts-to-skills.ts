import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";

interface ConvertedSkill {
  name: string;
  description: string;
  userInvocable: boolean;
  disableModelInvocation: boolean;
  body: string;
  source: "user" | "project";
}

function parsePromptFile(content: string): {
  description: string;
  enabled: boolean;
  body: string;
} {
  const frontMatterMatch = content.match(
    /^---\s*\n([\s\S]*?)\n---\s*(?:\n([\s\S]*))?$/,
  );

  if (!frontMatterMatch) {
    const firstLine = content.split("\n")[0].trim();
    return {
      description:
        firstLine.slice(0, 50) + (firstLine.length > 50 ? "..." : ""),
      enabled: true,
      body: content,
    };
  }

  const yamlContent = frontMatterMatch[1];
  const promptContent = frontMatterMatch[2] || "";

  const defaultDescription =
    promptContent.split("\n")[0].trim().slice(0, 50) +
    (promptContent.split("\n")[0].trim().length > 50 ? "..." : "");

  let description = defaultDescription;
  let enabled = true;

  const descriptionMatch = yamlContent.match(/^description:\s*(.+)$/m);
  if (descriptionMatch) {
    description = descriptionMatch[1].trim().replace(/^["']|["']$/g, "");
  }

  const enabledMatch = yamlContent.match(/^enabled:\s*(true|false)$/im);
  if (enabledMatch) {
    enabled = enabledMatch[1].toLowerCase() === "true";
  }

  return { description, enabled, body: promptContent };
}

function buildSkillMd(skill: ConvertedSkill): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`name: ${skill.name}`);
  lines.push(`description: ${skill.description}`);
  lines.push(`user-invocable: ${skill.userInvocable}`);
  if (skill.disableModelInvocation) {
    lines.push(`disable-model-invocation: ${skill.disableModelInvocation}`);
  }
  lines.push("---");
  if (skill.body.trim()) {
    lines.push("");
    lines.push(skill.body.trim());
  }
  lines.push("");
  return lines.join("\n");
}

async function convertDir(
  sourceDir: string,
  targetDir: string,
  source: "user" | "project",
): Promise<ConvertedSkill[]> {
  const converted: ConvertedSkill[] = [];

  let entries: string[];
  try {
    entries = await readdir(sourceDir);
  } catch {
    return converted;
  }

  const mdFiles = entries.filter((f) => f.endsWith(".md"));

  for (const file of mdFiles) {
    const filePath = join(sourceDir, file);
    const content = await readFile(filePath, "utf8");
    const parsed = parsePromptFile(content);
    const name = basename(file, ".md");

    const skill: ConvertedSkill = {
      name,
      description: parsed.description,
      userInvocable: parsed.enabled,
      disableModelInvocation: !parsed.enabled,
      body: parsed.body,
      source,
    };

    const skillDir = join(targetDir, name);
    await mkdir(skillDir, { recursive: true });

    const skillContent = buildSkillMd(skill);
    const skillPath = join(skillDir, "SKILL.md");
    await writeFile(skillPath, skillContent, "utf8");

    converted.push(skill);
    const mode = parsed.enabled ? "user+model" : "doc-only";
    console.info(`  ✓ ${name} (${mode})`);
  }

  return converted;
}

async function main() {
  const userPromptsDir = join(homedir(), ".acai", "prompts");
  const userSkillsDir = join(homedir(), ".agents", "skills");

  const projectPromptsDir = join(process.cwd(), ".acai", "prompts");
  const projectSkillsDir = join(process.cwd(), ".agents", "skills");

  console.info("Converting user prompts...");
  const userSkills = await convertDir(
    userPromptsDir,
    userSkillsDir,
    "user",
  );
  console.info(`Converted ${userSkills.length} user prompts.\n`);

  console.info("Converting project prompts...");
  const projectSkills = await convertDir(
    projectPromptsDir,
    projectSkillsDir,
    "project",
  );
  console.info(`Converted ${projectSkills.length} project prompts.\n`);

  const total = userSkills.length + projectSkills.length;
  const disabled = [...userSkills, ...projectSkills].filter(
    (s) => s.disableModelInvocation,
  ).length;
  console.info(
    `Done. ${total} skills created (${total - disabled} active, ${disabled} doc-only).`,
  );
}

main().catch((err) => {
  console.error("Conversion failed:", err);
  process.exit(1);
});
