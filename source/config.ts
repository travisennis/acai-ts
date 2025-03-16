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

  ensurePath(subdir?: string): string {
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

  // Project config helpers
  async readProjectConfig(): Promise<ProjectConfig> {
    const configPath = path.join(this.project.getPath(), "acai.json");
    try {
      const data = await fs.readFile(configPath, "utf8");
      return jsonParser(ProjectConfigSchema).parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return ProjectConfigSchema.parse({});
      }
      throw error;
    }
  }
  async readRulesFile(): Promise<string> {
    const rulesPath = path.join(this.project.getPath(), "rules.md");
    try {
      return await fs.readFile(rulesPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return "";
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

  async writeAppConfig(
    configName: string,
    data: Record<PropertyKey, unknown>,
  ): Promise<void> {
    this.app.ensurePath();
    const configPath = path.join(this.app.getPath(), `${configName}.json`);
    await fs.writeFile(configPath, JSON.stringify(data, null, 2));
  }
}

// Type definitions
const ProjectConfigSchema = z.object({
  build: z.string().optional(),
  lint: z.string().optional(),
  format: z.string().optional(),
  test: z.string().optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

// Create a singleton instance
export const config = new ConfigManager();

// import { config } from "./config.ts";

// // For the logger system
// const logsDir = await config.app.ensurePath("logs");
// // yourLoggerSystem.setOutputDirectory(logsDir);

// // For the session system
// const sessionsDir = await config.app.ensurePath("sessions");
// // yourSessionManager.setStorageDirectory(sessionsDir);

// // For the audit system
// const auditDir = await config.app.ensurePath("audit");
// // yourAuditSystem.setOutputDirectory(auditDir);

// // Still able to use config features
// const projectConfig = await config.readProjectConfig();
// const rules = await config.readRulesFile();
