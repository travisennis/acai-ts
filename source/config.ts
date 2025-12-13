import { mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { jsonParser } from "./parsing.ts";

const defaultConfig = {
  systemPromptType: "full",
  loop: {
    maxIterations: 200,
  },
  tools: {
    activeTools: undefined as string[] | undefined,
    maxTokens: 30000,
    maxResults: 30,
    dynamicTools: {
      enabled: true,
      maxTools: 10,
    },
  },
  notify: true,
  readOnlyFiles: [] as string[],
  skills: {
    enabled: true,
  },
} as const;

// Type definitions
const ProjectConfigSchema = z.object({
  systemPromptType: z
    .enum(["full", "minimal", "cli"])
    .optional()
    .default(defaultConfig.systemPromptType),
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
      dynamicTools: z
        .object({
          enabled: z
            .boolean()
            .default(defaultConfig.tools.dynamicTools.enabled),
          maxTools: z
            .number()
            .default(defaultConfig.tools.dynamicTools.maxTools),
        })
        .optional()
        .default(defaultConfig.tools.dynamicTools),
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
}

export class ConfigManager {
  readonly project: DirectoryProvider;
  readonly app: DirectoryProvider;

  constructor() {
    this.project = new DirectoryProvider(path.join(process.cwd(), ".acai"));
    this.app = new DirectoryProvider(path.join(homedir(), ".acai"));
  }

  // Get the log directory that's accessible via bash tool
  getAccessibleLogDir(): string {
    return this.app.getPath("logs");
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

  // Project config helpers
  async readProjectConfig(): Promise<ProjectConfig> {
    const appConfigPath = path.join(this.app.getPath(), "acai.json");
    const projectConfigPath = path.join(this.project.getPath(), "acai.json");

    const appConfig = await this._readConfig(appConfigPath);
    const projectConfig = await this._readConfig(projectConfigPath);

    const mergedConfig = {
      ...appConfig,
      ...projectConfig,
    };

    return ProjectConfigSchema.parse(mergedConfig);
  }

  // Skills settings helpers
  async getSkillsEnabled(): Promise<boolean> {
    const projectConfig = await this.readProjectConfig();
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

  async readAgentsFile(): Promise<string> {
    const agentsPath = path.join(process.cwd(), "AGENTS.md");
    try {
      return await fs.readFile(agentsPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return "";
      }
      throw error;
    }
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

  // App config helpers
  async readAppConfig(configName: string): Promise<ProjectConfig> {
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

  async ensureAppConfig(configName: string): Promise<ProjectConfig> {
    const configPath = path.join(this.app.getPath(), `${configName}.json`);

    try {
      await fs.access(configPath);
      return await this.readAppConfig(configName);
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
