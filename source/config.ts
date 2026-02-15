import { existsSync, mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { jsonParser } from "./parsing.ts";

export const defaultConfig = {
  loop: {
    maxIterations: 200,
  },
  tools: {
    activeTools: undefined as string[] | undefined,
    maxTokens: 30000,
    maxResults: 30,
  },
  notify: true,
  readOnlyFiles: [] as string[],
  skills: {
    enabled: true,
  },
  autoGenerateRules: false,
  env: {} as Record<string, string>,
} as const;

// Type definitions
const ProjectConfigSchema = z.object({
  logs: z
    .object({
      path: z.string(),
    })
    .optional(),
  loop: z
    .object({
      maxIterations: z.number().default(defaultConfig.loop.maxIterations),
    })
    .optional()
    .default(defaultConfig.loop),
  tools: z
    .object({
      activeTools: z.array(z.string()).optional(),
      maxTokens: z.number().default(defaultConfig.tools.maxTokens),
      maxResults: z.number().default(defaultConfig.tools.maxResults),
    })
    .optional()
    .default(defaultConfig.tools),
  notify: z.boolean().optional().default(defaultConfig.notify),
  readOnlyFiles: z
    .array(z.string())
    .optional()
    .default(defaultConfig.readOnlyFiles),
  skills: z
    .object({
      enabled: z.boolean().optional().default(defaultConfig.skills.enabled),
    })
    .optional()
    .default(defaultConfig.skills),
  autoGenerateRules: z
    .boolean()
    .optional()
    .default(defaultConfig.autoGenerateRules),
  env: z.record(z.string(), z.string()).optional().default(defaultConfig.env),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export class DirectoryProvider {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  getPath(subdir?: string): string {
    return subdir ? path.join(this.baseDir, subdir) : this.baseDir;
  }

  // Async-by-default: prefer non-blocking filesystem operations.
  async ensurePath(subdir?: string): Promise<string> {
    const dirPath = this.getPath(subdir);
    await fs.mkdir(dirPath, { recursive: true });
    return dirPath;
  }

  // Synchronous helper for call-sites that require immediate directory availability.
  ensurePathSync(subdir?: string): string {
    const dirPath = this.getPath(subdir);
    mkdirSync(dirPath, { recursive: true });
    return dirPath;
  }

  // Check if directory exists without creating it
  async exists(subdir?: string): Promise<boolean> {
    const dirPath = this.getPath(subdir);
    try {
      await fs.access(dirPath);
      return true;
    } catch {
      return false;
    }
  }

  // Synchronous version of exists check
  existsSync(subdir?: string): boolean {
    const dirPath = this.getPath(subdir);
    return existsSync(dirPath);
  }
}

export class ConfigManager {
  readonly project: DirectoryProvider;
  readonly app: DirectoryProvider;

  constructor() {
    this.project = new DirectoryProvider(path.join(process.cwd(), ".acai"));
    this.app = new DirectoryProvider(path.join(homedir(), ".acai"));
  }

  private async _readConfig(
    configPath: string,
  ): Promise<Partial<ProjectConfig>> {
    try {
      const data = await fs.readFile(configPath, "utf8");
      return jsonParser(ProjectConfigSchema).parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }

  // Get merged configuration (project overrides app)
  async getConfig(): Promise<ProjectConfig> {
    const appConfigPath = path.join(this.app.getPath(), "acai.json");
    const projectConfigPath = path.join(this.project.getPath(), "acai.json");

    const appConfig = await this._readConfig(appConfigPath);
    const projectConfig = await this._readConfig(projectConfigPath);

    const mergedEnv = {
      ...appConfig.env,
      ...projectConfig.env,
    };

    const mergedConfig = {
      ...appConfig,
      ...projectConfig,
      env: mergedEnv,
    };

    return ProjectConfigSchema.parse(mergedConfig);
  }

  // Skills settings helpers
  async getSkillsEnabled(): Promise<boolean> {
    const projectConfig = await this.getConfig();
    return projectConfig.skills?.enabled ?? true;
  }

  async setSkillsEnabled(enabled: boolean): Promise<void> {
    const configPath = path.join(this.app.getPath(), "acai.json");
    let configData: Partial<ProjectConfig> = {};

    try {
      const data = await fs.readFile(configPath, "utf8");
      configData = jsonParser(ProjectConfigSchema.partial()).parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    if (!configData.skills) {
      configData.skills = { enabled: true };
    }
    configData.skills.enabled = enabled;

    await this.app.ensurePath();
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2));
  }

  async readAgentsFiles(): Promise<{ path: string; content: string }[]> {
    const files: { path: string; content: string }[] = [];

    const agentsPaths = [
      {
        absolute: path.join(this.app.getPath(), "AGENTS.md"),
        relative: "~/.acai/AGENTS.md",
      },
      {
        absolute: path.join(process.cwd(), "AGENTS.md"),
        relative: "./AGENTS.md",
      },
    ];
    for (const { absolute, relative } of agentsPaths) {
      try {
        const content = await fs.readFile(absolute, "utf8");
        files.push({
          path: relative,
          content,
        });
      } catch (_error) {
        // ignore
      }
    }

    return files;
  }

  async writeAgentsFile(rules: string): Promise<void> {
    const agentsPath = path.join(process.cwd(), "AGENTS.md");
    try {
      return await fs.writeFile(agentsPath, rules, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  }
  // Project-specific learned rules
  async readProjectLearnedRulesFile(): Promise<string> {
    const rulesPath = path.join(
      this.project.getPath("rules"),
      "learned-rules.md",
    );
    try {
      return await fs.readFile(rulesPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return "";
      }
      throw error;
    }
  }

  async writeProjectLearnedRulesFile(rules: string): Promise<void> {
    // Only write project rules if the project directory exists
    if (!(await this.project.exists())) {
      return; // Silently return if project directory doesn't exist
    }
    const rulesDir = await this.project.ensurePath("rules");
    const rulesPath = path.join(rulesDir, "learned-rules.md");
    try {
      return await fs.writeFile(rulesPath, rules, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  }

  // App-cached learned rules (used during conversation analysis)
  async readCachedLearnedRulesFile(): Promise<string> {
    const rulesPath = path.join(this.app.getPath("rules"), "learned-rules.md");
    try {
      return await fs.readFile(rulesPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return "";
      }
      throw error;
    }
  }

  async writeCachedLearnedRulesFile(rules: string): Promise<void> {
    const rulesDir = await this.app.ensurePath("rules");
    const rulesPath = path.join(rulesDir, "learned-rules.md");
    try {
      return await fs.writeFile(rulesPath, rules, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
  }

  // Private helper for reading app config
  private async _readAppConfig(configName: string): Promise<ProjectConfig> {
    const configPath = path.join(this.app.getPath(), `${configName}.json`);
    try {
      const data = await fs.readFile(configPath, "utf8");
      return ProjectConfigSchema.parse(JSON.parse(data));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return ProjectConfigSchema.parse(defaultConfig);
      }
      throw error;
    }
  }

  // Ensure default app configuration exists
  async ensureDefaultConfig(configName: string): Promise<ProjectConfig> {
    const configPath = path.join(this.app.getPath(), `${configName}.json`);

    try {
      await fs.access(configPath);
      return await this._readAppConfig(configName);
    } catch {
      // Create directory and default config if missing
      await this.app.ensurePath();

      await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
      return ProjectConfigSchema.parse(defaultConfig);
    }
  }

  async writeAppConfig(
    configName: string,
    data: Record<PropertyKey, unknown>,
  ): Promise<void> {
    await this.app.ensurePath();
    const configPath = path.join(this.app.getPath(), `${configName}.json`);
    await fs.writeFile(configPath, JSON.stringify(data, null, 2));
  }
}

// Create a singleton instance
export const config = new ConfigManager();
