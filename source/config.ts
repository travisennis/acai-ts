import fs from "node:fs/promises";
import path from "node:path";
import * as xdg from "xdg-basedir";
import { z } from "zod";
import logger from "./logger";
import { jsonParser } from "./parsing";

logger.info(xdg, "App config dirs:");

const ProjectConfigSchema = z.object({
  build: z.string().optional(),
  lint: z.string().optional(),
  format: z.string().optional(),
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

async function readAppConfig(configName: string): Promise<any> {
  const configPath = path.join(
    xdg.xdgConfig ?? "",
    "acai",
    `${configName}.json`,
  );
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

async function writeAppConfig(configName: string, data: any): Promise<void> {
  const configDir = path.join(xdg.xdgConfig ?? "acai");
  const configPath = path.join(configDir, `${configName}.json`);
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(data, null, 2));
}

export { readAppConfig, writeAppConfig, readProjectConfig };