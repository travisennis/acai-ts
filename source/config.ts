import fs from "node:fs/promises";
import path from "node:path";
import { envPaths } from "@travisennis/stdlib/env";
import { z } from "zod";
import { jsonParser } from "./parsing.ts";

// Project Config
export function getProjectConfigDir() {
  const configPath = path.join(process.cwd(), ".acai");
  return configPath;
}

const ProjectConfigSchema = z.object({
  build: z.string().optional(),
  lint: z.string().optional(),
  format: z.string().optional(),
  test: z.string().optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export async function readProjectConfig(): Promise<ProjectConfig> {
  const configPath = path.join(getProjectConfigDir(), "acai.json");
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

export async function readRulesFile(): Promise<string> {
  const rulesPath = path.join(getProjectConfigDir(), "rules.md");
  try {
    return await fs.readFile(rulesPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

// App Config
export async function readAppConfig(
  configName: string,
): Promise<Record<PropertyKey, unknown>> {
  const configPath = path.join(envPaths("acai").config, `${configName}.json`);
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

export async function writeAppConfig(
  configName: string,
  data: Record<PropertyKey, unknown>,
): Promise<void> {
  const configDir = envPaths("acai").config;
  const configPath = path.join(configDir, `${configName}.json`);
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(data, null, 2));
}
