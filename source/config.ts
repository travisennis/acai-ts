import fs from "node:fs/promises";
import path from "node:path";
import { envPaths } from "@travisennis/stdlib/env";
import { z } from "zod";
import { jsonParser } from "./parsing.ts";

const ProjectConfigSchema = z.object({
  build: z.string().optional(),
  lint: z.string().optional(),
  format: z.string().optional(),
  test: z.string().optional(),
});

type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

async function readProjectConfig(): Promise<ProjectConfig> {
  const configPath = path.join(process.cwd(), ".acai", "acai.json");
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

async function readAppConfig(
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

async function writeAppConfig(
  configName: string,
  data: Record<PropertyKey, unknown>,
): Promise<void> {
  const configDir = envPaths("acai").config;
  const configPath = path.join(configDir, `${configName}.json`);
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(data, null, 2));
}

async function readRulesFile(): Promise<string> {
  const rulesPath = path.join(process.cwd(), ".acai", "rules.md");
  try {
    return await fs.readFile(rulesPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

export { readAppConfig, writeAppConfig, readProjectConfig, readRulesFile };
