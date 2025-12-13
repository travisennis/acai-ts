import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { logger } from "./logger.ts";

// Core skill interfaces
export interface SkillFrontmatter {
  name?: string;
  description: string;
}

export interface Skill {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: string; // "user", "project", "codex-user", etc.
}

export interface LoadSkillsFromDirOptions {
  dir: string;
  source: string;
  useColonPath?: boolean; // For colon-separated names (db:migrate)
}

const CONFIG_DIR_NAME = ".acai";

function stripQuotes(str: string): string {
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    return str.slice(1, -1);
  }
  return str;
}

function parseFrontmatter(content: string): {
  frontmatter: SkillFrontmatter;
  body: string;
} {
  const frontmatter: SkillFrontmatter = { description: "" };

  const normalizedContent = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (!normalizedContent.startsWith("---")) {
    return { frontmatter, body: normalizedContent };
  }

  const endIndex = normalizedContent.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { frontmatter, body: normalizedContent };
  }

  const frontmatterBlock = normalizedContent.slice(4, endIndex);
  const body = normalizedContent.slice(endIndex + 4).trim();

  for (const line of frontmatterBlock.split("\n")) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      const key = match[1];
      const value = stripQuotes(match[2].trim());
      if (key === "name") {
        frontmatter.name = value;
      } else if (key === "description") {
        frontmatter.description = value;
      }
    }
  }

  return { frontmatter, body };
}

async function loadSkillsFromDirInternal(
  dir: string,
  source: string,
  mode: "recursive" | "claude",
  useColonPath: boolean,
  subdir = "",
): Promise<Skill[]> {
  const skills: Skill[] = [];
  const fullDir = join(dir, subdir);

  try {
    const entries = await readdir(fullDir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files and directories
      if (entry.name.startsWith(".")) {
        continue;
      }

      const entryPath = join(fullDir, entry.name);

      // Skip symbolic links to avoid infinite recursion
      try {
        const stats = await stat(entryPath);
        if (stats.isSymbolicLink()) {
          continue;
        }
      } catch {
        // If we can't stat, skip it
        continue;
      }

      if (entry.isDirectory()) {
        if (mode === "recursive") {
          // Recursively scan subdirectories
          const newSubdir = subdir ? join(subdir, entry.name) : entry.name;
          const subSkills = await loadSkillsFromDirInternal(
            dir,
            source,
            mode,
            useColonPath,
            newSubdir,
          );
          skills.push(...subSkills);
        } else if (mode === "claude") {
          // Claude mode: only check immediate subdirectories for SKILL.md
          const skillPath = join(entryPath, "SKILL.md");
          try {
            const content = await readFile(skillPath, "utf8");
            const { frontmatter } = parseFrontmatter(content);

            if (!frontmatter.description) {
              continue;
            }

            const skillName = frontmatter.name || entry.name;
            skills.push({
              name: skillName,
              description: frontmatter.description,
              filePath: skillPath,
              baseDir: entryPath,
              source,
            });
          } catch (error) {
            logger.warn(error, `Failed to load skill from ${skillPath}:`);
          }
        }
      } else if (
        entry.isFile() &&
        entry.name === "SKILL.md" &&
        mode === "recursive"
      ) {
        // Found a SKILL.md file in recursive mode
        try {
          const content = await readFile(entryPath, "utf8");
          const { frontmatter } = parseFrontmatter(content);

          if (!frontmatter.description) {
            continue;
          }

          // Determine skill name
          let skillName: string;
          if (frontmatter.name) {
            skillName = frontmatter.name;
          } else if (useColonPath && subdir) {
            // Use colon-separated path for subdirectories
            skillName = subdir.split(sep).join(":");
          } else if (subdir) {
            // Use the directory name
            const dirParts = subdir.split(sep);
            skillName = dirParts[dirParts.length - 1];
          } else {
            // Shouldn't happen in practice, but fallback
            skillName = "unnamed";
          }

          // Base directory is the directory containing the SKILL.md file
          const baseDir = subdir ? join(dir, subdir) : dir;

          skills.push({
            name: skillName,
            description: frontmatter.description,
            filePath: entryPath,
            baseDir,
            source,
          });
        } catch (error) {
          logger.warn(error, `Failed to load skill from ${entryPath}:`);
        }
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.error(error, `Error reading skills directory ${fullDir}:`);
    }
  }

  return skills;
}

export async function loadSkillsFromDir(
  options: LoadSkillsFromDirOptions,
  subdir = "",
): Promise<Skill[]> {
  const { dir, source, useColonPath = false } = options;
  return await loadSkillsFromDirInternal(
    dir,
    source,
    "recursive",
    useColonPath,
    subdir,
  );
}

export async function loadSkills(): Promise<Skill[]> {
  const skillMap = new Map<string, Skill>();

  // Codex: recursive, simple directory name
  const codexUserDir = join(homedir(), ".codex", "skills");
  for (const skill of await loadSkillsFromDirInternal(
    codexUserDir,
    "codex-user",
    "recursive",
    false,
  )) {
    skillMap.set(skill.name, skill);
  }

  // Claude: single level only
  const claudeUserDir = join(homedir(), ".claude", "skills");
  for (const skill of await loadSkillsFromDirInternal(
    claudeUserDir,
    "claude-user",
    "claude",
    false,
  )) {
    skillMap.set(skill.name, skill);
  }

  const claudeProjectDir = resolve(process.cwd(), ".claude", "skills");
  for (const skill of await loadSkillsFromDirInternal(
    claudeProjectDir,
    "claude-project",
    "claude",
    false,
  )) {
    skillMap.set(skill.name, skill);
  }

  // Pi: recursive, colon-separated path names
  const globalSkillsDir = join(homedir(), CONFIG_DIR_NAME, "skills");
  for (const skill of await loadSkillsFromDirInternal(
    globalSkillsDir,
    "user",
    "recursive",
    true,
  )) {
    skillMap.set(skill.name, skill);
  }

  const projectSkillsDir = resolve(process.cwd(), CONFIG_DIR_NAME, "skills");
  for (const skill of await loadSkillsFromDirInternal(
    projectSkillsDir,
    "project",
    "recursive",
    true,
  )) {
    skillMap.set(skill.name, skill);
  }

  return Array.from(skillMap.values());
}

export function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) {
    return "";
  }

  const lines = [
    "\n\n<available_skills>",
    "The following skills provide specialized instructions for specific tasks.",
    "Use the read tool to load a skill's file when the task matches its description.",
    "Skills may contain {baseDir} placeholders - replace them with the skill's base directory path.\n",
  ];

  for (const skill of skills) {
    lines.push(`- ${skill.name}: ${skill.description}`);
    lines.push(`  File: ${skill.filePath}`);
    lines.push(`  Base directory: ${skill.baseDir}`);
  }

  lines.push("</available_skills>");

  return lines.join("\n");
}
