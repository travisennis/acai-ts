import fs from "node:fs/promises";
import path from "node:path";
import { xdgCache, xdgConfig, xdgData, xdgState } from "xdg-basedir";
import { z } from "zod";
import logger from "./logger";

logger.info("App config dirs:", xdgConfig, xdgCache, xdgData, xdgState);

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
    return ProjectConfigSchema.parse(JSON.parse(data));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return ProjectConfigSchema.parse({});
    }
    throw error;
  }
}

async function readAppConfig(configName: string): Promise<any> {
  const configPath = path.join(xdgConfig ?? "", "acai", `${configName}.json`);
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
  const configDir = path.join(xdgConfig ?? "acai");
  const configPath = path.join(configDir, `${configName}.json`);
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(data, null, 2));
}

export { readAppConfig, writeAppConfig, readProjectConfig };
