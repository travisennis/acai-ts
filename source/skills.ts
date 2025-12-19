import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { logger } from "./logger.ts";
import { parseFrontMatter } from "./utils/yaml.ts";

// Core skill interfaces
export interface SkillFrontmatter {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  "allowed-tools"?: string;
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

// Validation functions
function validateSkillName(
  name: string,
  directoryName: string,
): { valid: boolean; error?: string } {
  // Check required field
  if (!name) {
    return { valid: false, error: "Name field is required" };
  }

  // Check length (1-64 characters)
  if (name.length < 1 || name.length > 64) {
    return { valid: false, error: "Name must be 1-64 characters long" };
  }

  // Check allowed characters (lowercase letters, numbers, hyphens)
  if (!/^[a-z0-9-]+$/.test(name)) {
    return {
      valid: false,
      error: "Name can only contain lowercase letters, numbers, and hyphens",
    };
  }

  // Check no leading or trailing hyphens
  if (name.startsWith("-") || name.endsWith("-")) {
    return { valid: false, error: "Name cannot start or end with a hyphen" };
  }

  // Check no consecutive hyphens
  if (name.includes("--")) {
    return { valid: false, error: "Name cannot contain consecutive hyphens" };
  }

  // Check matches directory name
  if (name !== directoryName) {
    return {
      valid: false,
      error: `Name "${name}" must match directory name "${directoryName}"`,
    };
  }

  return { valid: true };
}

function validateSkillDescription(description: string): {
  valid: boolean;
  error?: string;
} {
  // Check required field
  if (!description) {
    return { valid: false, error: "Description field is required" };
  }

  // Check length (1-1024 characters)
  if (description.length < 1 || description.length > 1024) {
    return {
      valid: false,
      error: "Description must be 1-1024 characters long",
    };
  }

  return { valid: true };
}

function parseFrontmatter(content: string): {
  frontmatter: SkillFrontmatter;
  body: string;
} {
  const { data, content: body } = parseFrontMatter(content);

  // Type cast and validate required fields
  const name = data["name"] as string;
  const description = data["description"] as string;

  // Set default empty values for optional fields
  const frontmatter: SkillFrontmatter = {
    name: name || "",
    description: description || "",
    license: (data["license"] as string) || undefined,
    compatibility: (data["compatibility"] as string) || undefined,
    metadata: (data["metadata"] as Record<string, string>) || undefined,
    "allowed-tools": (data["allowed-tools"] as string) || undefined,
  };

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

            // Validate required fields
            const nameValidation = validateSkillName(
              frontmatter.name,
              entry.name,
            );
            if (!nameValidation.valid) {
              logger.warn(
                `Invalid skill name in ${skillPath}: ${nameValidation.error}`,
              );
              continue;
            }

            const descriptionValidation = validateSkillDescription(
              frontmatter.description,
            );
            if (!descriptionValidation.valid) {
              logger.warn(
                `Invalid skill description in ${skillPath}: ${descriptionValidation.error}`,
              );
              continue;
            }

            skills.push({
              name: frontmatter.name,
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

          // Validate required fields
          const nameValidation = validateSkillName(
            frontmatter.name,
            entry.name,
          );
          if (!nameValidation.valid) {
            logger.warn(
              `Invalid skill name in ${entryPath}: ${nameValidation.error}`,
            );
            continue;
          }

          const descriptionValidation = validateSkillDescription(
            frontmatter.description,
          );
          if (!descriptionValidation.valid) {
            logger.warn(
              `Invalid skill description in ${entryPath}: ${descriptionValidation.error}`,
            );
            continue;
          }

          // Base directory is the directory containing the SKILL.md file
          const baseDir = subdir ? join(dir, subdir) : dir;

          skills.push({
            name: frontmatter.name,
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

  // acai: recursive, colon-separated path names
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
    "\n\nThe following skills provide specialized instructions for specific tasks.",
    "Use the readFile tool to load a skill's file when the task matches its description.",
    "Skills may contain {baseDir} placeholders - replace them with the skill's base directory path.",
    "",
    "<available_skills>",
  ];

  for (const skill of skills) {
    lines.push("<skill>");
    lines.push("<name>");
    lines.push(skill.name);
    lines.push("</name>");
    lines.push("<description>");
    lines.push(skill.description);
    lines.push("</description>");
    lines.push("<location>");
    lines.push(skill.filePath);
    lines.push("</location>");
    lines.push("</skill>");
  }

  lines.push("</available_skills>");

  return lines.join("\n");
}
