import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defaultConfig } from "../config.ts";
import style from "../terminal/style.ts";
import type { Container, Editor, TUI } from "../tui/index.ts";
import { Spacer, Text } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

// Development directory path - should not initialize here
const DEVELOPMENT_DIRECTORY = "/Users/travisennis/Github/acai-ts";

export const initProjectCommand = (_options: CommandOptions): ReplCommand => {
  return {
    command: "/init-project",
    description:
      "Initialize a new acai project in the current directory. Creates missing directories and files without overwriting existing ones.",

    getSubCommands: () => Promise.resolve([]),

    async handle(
      _args: string[],
      {
        tui,
        container,
        editor,
      }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      const currentDir = process.cwd();

      // Safety check: prevent initialization in development directory
      if (currentDir === DEVELOPMENT_DIRECTORY) {
        container.addChild(
          new Text(
            style.red(
              "Cannot initialize project in acai-ts development directory.",
            ),
            1,
            0,
          ),
        );
        container.addChild(
          new Text("Run this command in a different project directory.", 2, 0),
        );
        tui.requestRender();
        editor.setText("");
        return "continue";
      }

      const projectDir = path.join(currentDir, ".acai");
      const created: string[] = [];
      const existing: string[] = [];

      container.addChild(new Text("Initializing acai project...", 1, 0));

      // Check and create base directory
      if (!existsSync(projectDir)) {
        mkdirSync(projectDir, { recursive: true });
        created.push(".acai/");
      } else {
        existing.push(".acai/");
      }

      // Check and create subdirectories
      const subdirs = ["prompts", "rules", "skills"];
      for (const subdir of subdirs) {
        const dirPath = path.join(projectDir, subdir);
        if (!existsSync(dirPath)) {
          mkdirSync(dirPath, { recursive: true });
          created.push(`.acai/${subdir}/`);
        } else {
          existing.push(`.acai/${subdir}/`);
        }
      }

      // Check and create config file
      const configPath = path.join(projectDir, "acai.json");
      if (!existsSync(configPath)) {
        writeFileSync(
          configPath,
          JSON.stringify(defaultConfig, null, 2),
          "utf8",
        );
        created.push(".acai/acai.json");
      } else {
        existing.push(".acai/acai.json");
      }

      // Provide feedback
      container.addChild(new Spacer(1));

      if (created.length > 0) {
        container.addChild(new Text(style.green("Created:"), 1, 0));
        for (const item of created) {
          container.addChild(new Text(`  ${item}`, 2, 0));
        }
      }

      if (existing.length > 0) {
        container.addChild(new Spacer(1));
        container.addChild(new Text(style.yellow("Already existed:"), 1, 0));
        for (const item of existing) {
          container.addChild(new Text(`  ${item}`, 2, 0));
        }
      }

      if (created.length === 0 && existing.length > 0) {
        container.addChild(new Spacer(1));
        container.addChild(
          new Text("Project already fully initialized. No changes made.", 1, 0),
        );
      }

      container.addChild(new Spacer(1));
      container.addChild(
        new Text("Project initialized successfully. You can now:", 1, 0),
      );
      container.addChild(
        new Text("  • Add project-specific prompts to .acai/prompts/", 2, 0),
      );
      container.addChild(
        new Text("  • Configure settings in .acai/acai.json", 2, 0),
      );
      container.addChild(
        new Text("  • Add project skills to .acai/skills/", 2, 0),
      );

      tui.requestRender();
      editor.setText("");
      return "continue";
    },
  };
};
