import fs from "node:fs/promises";
import path from "node:path";
import type { CoreMessage } from "ai";
import * as xdg from "xdg-basedir";
import { z } from "zod";
import logger from "./logger.js";
import { jsonParser } from "./parsing.js";

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

function getStateDir(): string {
  return path.join(
    xdg.xdgState ?? path.join(process.env.HOME ?? "", ".local", "state"),
    "acai",
  );
}

async function saveMessageHistory(messages: CoreMessage[]): Promise<void> {
  const stateDir = getStateDir();
  await fs.mkdir(stateDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/:/g, "-");
  const fileName = `message-history-${timestamp}.md`;
  const filePath = path.join(stateDir, fileName);

  const formattedContent = messages
    .map((message) => {
      const prefix = message.role === "user" ? "User:" : "Assistant:";
      return `${prefix}\n${message.content}`;
    })
    .join("\n\n");

  await fs.writeFile(filePath, formattedContent);
}

export { readAppConfig, writeAppConfig, readProjectConfig, saveMessageHistory };
