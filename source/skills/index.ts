import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { logger } from "../utils/logger.ts";
import { parseFrontMatter } from "../utils/yaml.ts";

// Core skill interfaces
interface SkillFrontmatter {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  "allowed-tools"?: string;
  "user-invocable"?: boolean;
  "disable-model-invocation"?: boolean;
  arguments?: string;
  examples?: string[];
}

export interface Skill {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: string; // "user", "project", "codex-user", etc.
  userInvocable: boolean;
  disableModelInvocation: boolean;
  allowedTools?: string;
  arguments?: string;
  examples?: string[];
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
  const userInvocable = data["user-invocable"];
  const disableModelInvocation = data["disable-model-invocation"];

  const frontmatter: SkillFrontmatter = {
    name: name || "",
    description: description || "",
    license: (data["license"] as string) || undefined,
    compatibility: (data["compatibility"] as string) || undefined,
    metadata: (data["metadata"] as Record<string, string>) || undefined,
    "allowed-tools": (data["allowed-tools"] as string) || undefined,
    "user-invocable":
      typeof userInvocable === "boolean" ? userInvocable : undefined,
    "disable-model-invocation":
      typeof disableModelInvocation === "boolean"
        ? disableModelInvocation
        : undefined,
    arguments: (data["arguments"] as string) || undefined,
    examples: (data["examples"] as string[]) || undefined,
  };

  return { frontmatter, body };
}

/**
 * Creates a Skill object from frontmatter and path info
 */
function createSkill(
  frontmatter: SkillFrontmatter,
  filePath: string,
  baseDir: string,
  source: string,
): Skill {
  return {
    name: frontmatter.name,
    description: frontmatter.description,
    filePath,
    baseDir,
    source,
    userInvocable: frontmatter["user-invocable"] ?? true,
    disableModelInvocation: frontmatter["disable-model-invocation"] ?? false,
    allowedTools: frontmatter["allowed-tools"],
    arguments: frontmatter.arguments,
    examples: frontmatter.examples,
  };
}

/**
 * Validates and creates a skill from a SKILL.md file
 * Returns null if validation fails
 */
async function tryLoadSkillFromFile(
  skillPath: string,
  directoryName: string,
  baseDir: string,
  source: string,
): Promise<Skill | null> {
  try {
    const content = await readFile(skillPath, "utf8");
    const { frontmatter } = parseFrontmatter(content);

    const nameValidation = validateSkillName(frontmatter.name, directoryName);
    if (!nameValidation.valid) {
      logger.warn(
        `Invalid skill name in ${skillPath}: ${nameValidation.error}`,
      );
      return null;
    }

    const descriptionValidation = validateSkillDescription(
      frontmatter.description,
    );
    if (!descriptionValidation.valid) {
      logger.warn(
        `Invalid skill description in ${skillPath}: ${descriptionValidation.error}`,
      );
      return null;
    }

    return createSkill(frontmatter, skillPath, baseDir, source);
  } catch (error) {
    logger.warn(error, `Failed to load skill from ${skillPath}:`);
    return null;
  }
}

/**
 * Checks if an entry should be skipped (hidden files, symlinks)
 */
async function shouldSkipEntry(
  entryPath: string,
  entryName: string,
): Promise<boolean> {
  // Skip hidden files and directories
  if (entryName.startsWith(".")) {
    return true;
  }

  // Skip symbolic links to avoid infinite recursion
  try {
    const stats = await stat(entryPath);
    if (stats.isSymbolicLink()) {
      return true;
    }
  } catch {
    // If we can't stat, skip it
    return true;
  }

  return false;
}

async function loadSkillsFromDirInternal(
  dir: string,
  source: string,
  mode: "recursive" | "claude",
  _useColonPath: boolean,
  subdir = "",
): Promise<Skill[]> {
  const skills: Skill[] = [];
  const fullDir = join(dir, subdir);

  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    // @ts-expect-error - Node.js types have a quirk with withFileTypes
    entries = await readdir(fullDir, { withFileTypes: true });
  } catch (error) {
    // Directory doesn't exist or can't be read
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.error(error, `Error reading skills directory ${fullDir}:`);
    }
    return skills;
  }

  for (const entry of entries) {
    const entryName = entry.name.toString();
    const entryPath = join(fullDir, entryName);

    // Skip hidden files, symlinks, etc.
    if (await shouldSkipEntry(entryPath, entryName)) {
      continue;
    }

    // Handle directories
    if (entry.isDirectory()) {
      if (mode === "recursive") {
        // Recursively scan subdirectories
        const newSubdir = subdir ? join(subdir, entryName) : entryName;
        const subSkills = await loadSkillsFromDirInternal(
          dir,
          source,
          mode,
          false,
          newSubdir,
        );
        skills.push(...subSkills);
      } else if (mode === "claude") {
        // Claude mode: only check immediate subdirectories for SKILL.md
        const skillPath = join(entryPath, "SKILL.md");
        const skill = await tryLoadSkillFromFile(
          skillPath,
          entryName,
          entryPath,
          source,
        );
        if (skill) {
          skills.push(skill);
        }
      }
      continue;
    }

    // Handle files
    if (entry.isFile() && entryName === "SKILL.md" && mode === "recursive") {
      // Base directory is the directory containing the SKILL.md file
      const baseDir = subdir ? join(dir, subdir) : dir;
      const skill = await tryLoadSkillFromFile(
        entryPath,
        basename(dirname(entryPath)),
        baseDir,
        source,
      );
      if (skill) {
        skills.push(skill);
      }
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

  // Deprecated: warn if skills exist in old .acai directories
  const deprecatedGlobalDir = join(homedir(), CONFIG_DIR_NAME, "skills");
  try {
    const entries = await readdir(deprecatedGlobalDir);
    if (entries.length > 0) {
      logger.warn(
        "Skills found in ~/.acai/skills/ are deprecated and will not be loaded. Move them to ~/.agents/skills/ to continue using them.",
      );
    }
  } catch {
    // Directory doesn't exist, no warning needed
  }

  const deprecatedProjectDir = resolve(
    process.cwd(),
    CONFIG_DIR_NAME,
    "skills",
  );
  try {
    const entries = await readdir(deprecatedProjectDir);
    if (entries.length > 0) {
      logger.warn(
        "Skills found in .acai/skills/ are deprecated and will not be loaded. Move them to .agents/skills/ to continue using them.",
      );
    }
  } catch {
    // Directory doesn't exist, no warning needed
  }

  // .agents: recursive, colon-separated path names (primary)
  const agentsGlobalSkillsDir = join(homedir(), ".agents", "skills");
  for (const skill of await loadSkillsFromDirInternal(
    agentsGlobalSkillsDir,
    "user",
    "recursive",
    true,
  )) {
    skillMap.set(skill.name, skill);
  }

  const agentsProjectSkillsDir = resolve(process.cwd(), ".agents", "skills");
  for (const skill of await loadSkillsFromDirInternal(
    agentsProjectSkillsDir,
    "project",
    "recursive",
    true,
  )) {
    skillMap.set(skill.name, skill);
  }

  return Array.from(skillMap.values());
}

export function formatSkillsForPrompt(skills: Skill[]): string {
  const modelInvocableSkills = skills.filter((s) => !s.disableModelInvocation);

  if (modelInvocableSkills.length === 0) {
    return "";
  }

  const lines = [
    "\n\n## Skills",
    "",
    "<skills_instructions>",
    "When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.",
    "Use the Skill tool to load a skill's instructions when the task matches its description.",
    "</skills_instructions>",
    "",
    "<available_skills>",
  ];

  for (const skill of modelInvocableSkills) {
    lines.push("<skill>");
    lines.push("<name>");
    lines.push(skill.name);
    lines.push("</name>");
    lines.push("<description>");
    lines.push(skill.description);
    lines.push("</description>");
    lines.push("</skill>");
  }

  lines.push("</available_skills>");

  return lines.join("\n");
}
