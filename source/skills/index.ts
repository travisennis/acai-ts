import { readdir, readFile, realpath, stat } from "node:fs/promises";
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

interface LoadSkillsFromDirOptions {
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
    userInvocable: frontmatter["user-invocable"] ?? false,
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
 * Checks if an entry should be skipped (hidden files, inaccessible paths)
 */
async function shouldSkipEntry(
  entryPath: string,
  entryName: string,
): Promise<boolean> {
  if (entryName.startsWith(".")) {
    return true;
  }

  try {
    await stat(entryPath);
  } catch {
    return true;
  }

  return false;
}

/**
 * Resolves the real path of a directory and checks for symlink cycles.
 * Returns true if the directory can be safely processed.
 */
async function resolveSkillDir(
  fullDir: string,
  visited: Set<string>,
): Promise<boolean> {
  try {
    const real = await realpath(fullDir);
    if (visited.has(real)) {
      logger.warn(`Skipping ${fullDir}: symlink cycle detected`);
      return false;
    }
    visited.add(real);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads directory entries, returning null if the directory doesn't exist
 * or can't be read.
 */
async function readSkillDirEntries(
  fullDir: string,
): Promise<Awaited<ReturnType<typeof readdir>> | null> {
  try {
    // @ts-expect-error - Node.js types have a quirk with withFileTypes
    return await readdir(fullDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.error(error, `Error reading skills directory ${fullDir}:`);
    }
    return null;
  }
}

/**
 * Processes a directory entry in recursive mode: recursively scans subdirectories.
 */
async function handleRecursiveDir(
  entryName: string,
  dir: string,
  source: string,
  mode: "recursive" | "claude",
  subdir: string,
  visited: Set<string>,
): Promise<Skill[]> {
  const newSubdir = subdir ? join(subdir, entryName) : entryName;
  return await loadSkillsFromDirInternal(
    dir,
    source,
    mode,
    false,
    newSubdir,
    visited,
  );
}

/**
 * Processes a directory entry in claude mode: checks for SKILL.md in the subdirectory.
 */
async function handleClaudeDir(
  entryName: string,
  entryPath: string,
  source: string,
): Promise<Skill[]> {
  const skillPath = join(entryPath, "SKILL.md");
  const skill = await tryLoadSkillFromFile(
    skillPath,
    entryName,
    entryPath,
    source,
  );
  return skill ? [skill] : [];
}

/**
 * Processes a directory entry based on the scan mode.
 */
async function handleDirEntry(
  entryName: string,
  entryPath: string,
  dir: string,
  source: string,
  mode: "recursive" | "claude",
  subdir: string,
  visited: Set<string>,
): Promise<Skill[]> {
  if (mode === "recursive") {
    return await handleRecursiveDir(
      entryName,
      dir,
      source,
      mode,
      subdir,
      visited,
    );
  }
  return await handleClaudeDir(entryName, entryPath, source);
}

/**
 * Processes a SKILL.md file entry, loading it as a skill.
 */
async function handleSkillFile(
  entryPath: string,
  dir: string,
  subdir: string,
  source: string,
): Promise<Skill[]> {
  const baseDir = subdir ? join(dir, subdir) : dir;
  const skill = await tryLoadSkillFromFile(
    entryPath,
    basename(dirname(entryPath)),
    baseDir,
    source,
  );
  return skill ? [skill] : [];
}

async function loadSkillsFromDirInternal(
  dir: string,
  source: string,
  mode: "recursive" | "claude",
  _useColonPath: boolean,
  subdir = "",
  visited: Set<string> = new Set(),
): Promise<Skill[]> {
  const skills: Skill[] = [];
  const fullDir = join(dir, subdir);

  // Check symlink cycles
  if (!(await resolveSkillDir(fullDir, visited))) {
    return skills;
  }

  // Read directory
  const entries = await readSkillDirEntries(fullDir);
  if (!entries) return skills;

  // Process each entry
  for (const entry of entries) {
    const entryName = entry.name.toString();
    const entryPath = join(fullDir, entryName);

    if (await shouldSkipEntry(entryPath, entryName)) {
      continue;
    }

    if (entry.isDirectory()) {
      const subSkills = await handleDirEntry(
        entryName,
        entryPath,
        dir,
        source,
        mode,
        subdir,
        visited,
      );
      skills.push(...subSkills);
    } else if (
      entry.isFile() &&
      entryName === "SKILL.md" &&
      mode === "recursive"
    ) {
      const fileSkills = await handleSkillFile(
        entryPath,
        dir,
        subdir,
        source,
      );
      skills.push(...fileSkills);
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

class Skills {
  private skills: Skill[];

  constructor(skills: Skill[]) {
    this.skills = skills;
  }

  getAll(): Skill[] {
    return this.skills;
  }

  getUserInvocable(): Skill[] {
    return this.skills.filter((s) => s.userInvocable);
  }

  getModelInvocable(): Skill[] {
    return this.skills.filter((s) => !s.disableModelInvocation);
  }
}

export interface LoadSkillsOptions {
  additionalSkillPaths?: string[];
  dirs?: {
    codexUser?: string;
    claudeUser?: string;
    claudeProject?: string;
    agentsGlobal?: string;
    agentsProject?: string;
  };
}

async function warnIfDeprecatedSkillsDir(
  dirPath: string,
  message: string,
): Promise<void> {
  try {
    const entries = await readdir(dirPath);
    if (entries.length > 0) {
      logger.warn(message);
    }
  } catch {
    // Directory doesn't exist, no warning needed
  }
}

interface DirConfig {
  dir: string;
  source: string;
  mode: "recursive" | "claude";
  colonSeparated: boolean;
}

async function loadAllSkillDirs(
  configs: DirConfig[],
  skillMap: Map<string, Skill>,
): Promise<void> {
  for (const { dir, source, mode, colonSeparated } of configs) {
    for (const skill of await loadSkillsFromDirInternal(
      dir,
      source,
      mode,
      colonSeparated,
    )) {
      skillMap.set(skill.name, skill);
    }
  }
}

export async function loadSkills(
  additionalSkillPathsOrOptions?: string[] | LoadSkillsOptions,
): Promise<Skills> {
  const options: LoadSkillsOptions = Array.isArray(
    additionalSkillPathsOrOptions,
  )
    ? { additionalSkillPaths: additionalSkillPathsOrOptions }
    : (additionalSkillPathsOrOptions ?? {});

  const additionalSkillPaths = options.additionalSkillPaths ?? [];
  const dirs = options.dirs ?? {};

  const skillMap = new Map<string, Skill>();

  await warnIfDeprecatedSkillsDir(
    join(homedir(), CONFIG_DIR_NAME, "skills"),
    "Skills found in ~/.acai/skills/ are deprecated and will not be loaded. Move them to ~/.agents/skills/ to continue using them.",
  );

  await warnIfDeprecatedSkillsDir(
    resolve(process.cwd(), CONFIG_DIR_NAME, "skills"),
    "Skills found in .acai/skills/ are deprecated and will not be loaded. Move them to ~/.agents/skills/ to continue using them.",
  );

  // --- User-level skills (lowest priority) ---

  await loadAllSkillDirs(
    [
      {
        dir: dirs.codexUser ?? join(homedir(), ".codex", "skills"),
        source: "codex-user",
        mode: "recursive",
        colonSeparated: false,
      },
      {
        dir: dirs.claudeUser ?? join(homedir(), ".claude", "skills"),
        source: "claude-user",
        mode: "claude",
        colonSeparated: false,
      },
      {
        dir: dirs.agentsGlobal ?? join(homedir(), ".agents", "skills"),
        source: "user",
        mode: "recursive",
        colonSeparated: true,
      },
    ],
    skillMap,
  );

  // --- Config-level skills (overrides user-level) ---

  for (const skillPath of additionalSkillPaths) {
    for (const skill of await loadSkillsFromDirInternal(
      skillPath,
      "config",
      "recursive",
      true,
    )) {
      skillMap.set(skill.name, skill);
    }
  }

  // --- Project-level skills (highest priority, always wins) ---

  await loadAllSkillDirs(
    [
      {
        dir: dirs.claudeProject ?? resolve(process.cwd(), ".claude", "skills"),
        source: "claude-project",
        mode: "claude",
        colonSeparated: false,
      },
      {
        dir: dirs.agentsProject ?? resolve(process.cwd(), ".agents", "skills"),
        source: "project",
        mode: "recursive",
        colonSeparated: true,
      },
    ],
    skillMap,
  );

  return new Skills(Array.from(skillMap.values()));
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
