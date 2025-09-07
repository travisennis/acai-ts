import { mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { jsonParser } from "./parsing.ts";

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
  async readAppConfig(
    configName: string,
  ): Promise<Record<PropertyKey, unknown>> {
    const configPath = path.join(this.app.getPath(), `${configName}.json`);
    try {
      const data = await fs.readFile(configPath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }

  async ensureAppConfig(
    configName: string,
  ): Promise<Record<PropertyKey, unknown>> {
    const configPath = path.join(this.app.getPath(), `${configName}.json`);

    try {
      await fs.access(configPath);
      return await this.readAppConfig(configName);
    } catch {
      // Create directory and default config if missing
      await this.app.ensurePath();

      const defaultConfig = {
        logs: {
          path: path.join(this.app.getPath(), "logs", "current.log"),
        },
        tools: {
          maxTokens: 30000,
          bash: {
            allowPipes: true,
            allowChaining: true,
            allowRedirection: true,
            maxSegments: 6,
            maxOutputBytes: 2_000_000,
          },
        },
        notify: true,
      };

      await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
      return defaultConfig;
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

// Type definitions
const ProjectConfigSchema = z.object({
  logs: z
    .object({
      path: z.string(),
    })
    .optional(),
  tools: z
    .object({
      maxTokens: z.number().default(30000),
      bash: z
        .object({
          allowPipes: z.boolean().default(true),
          allowChaining: z.boolean().default(true),
          allowRedirection: z.boolean().default(true),
          maxSegments: z.number().default(6),
          maxOutputBytes: z.number().default(2_000_000),
        })
        .optional()
        .default({
          allowPipes: true,
          allowChaining: true,
          allowRedirection: true,
          maxSegments: 6,
          maxOutputBytes: 2_000_000,
        }),
      dynamicTools: z
        .object({
          enabled: z.boolean().default(true),
          maxTools: z.number().default(10),
        })
        .optional()
        .default({
          enabled: true,
          maxTools: 10,
        }),
    })
    .optional()
    .default({
      maxTokens: 30000,
      bash: {
        allowPipes: true,
        allowChaining: true,
        allowRedirection: true,
        maxSegments: 6,
        maxOutputBytes: 2_000_000,
      },
      dynamicTools: {
        enabled: true,
        maxTools: 10,
      },
    }),
  notify: z.boolean().optional().default(true),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

// Create a singleton instance
export const config = new ConfigManager();
