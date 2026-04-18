import fs from "node:fs";
import path from "node:path";
import style from "../../terminal/style.ts";
import type { Container, Editor, TUI } from "../../tui/index.ts";
import { Text } from "../../tui/index.ts";
import type { CommandOptions, ReplCommand } from "../types.ts";
import {
  bashTemplate,
  nodeTemplate,
  textCompanionTemplate,
  textSchemaTemplate,
  zshTemplate,
} from "./templates.ts";

type ToolType = "bash" | "zsh" | "node" | "text";

const TOOL_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

export function toolsCommand(options: CommandOptions): ReplCommand {
  return {
    command: "/tools",
    description: "Manage dynamic tools (make, list)",
    aliases: [],

    getSubCommands: async () => ["make", "list"],

    async handle(
      args: string[],
      {
        tui,
        container,
        editor,
      }: {
        tui: TUI;
        container: Container;
        inputContainer: Container;
        editor: Editor;
      },
    ): Promise<"continue" | "use"> {
      const subCommand = args[0];

      if (subCommand === "make") {
        return handleToolMake(args.slice(1), options, container, editor, tui);
      }

      if (subCommand === "list") {
        return handleToolList(options, container, editor, tui);
      }

      // Default: show help
      container.addChild(
        new Text(
          style.dim(
            "Usage: /tools make <name> [--bash|--zsh|--node|--text] [--description <desc>] [--dir <path>]",
          ),
          0,
          1,
        ),
      );
      container.addChild(new Text(style.dim("       /tools list"), 0, 1));
      return "continue";
    },
  };
}

function writeToolFile(
  filePath: string,
  content: string,
  makeExecutable: boolean,
): string[] {
  const files: string[] = [];
  fs.writeFileSync(filePath, content, "utf8");
  if (makeExecutable) {
    fs.chmodSync(filePath, 0o755);
  }
  files.push(filePath);
  return files;
}

function createToolFiles(
  toolName: string,
  description: string,
  toolType: ToolType,
  outputDir: string,
): string[] | string {
  const files: string[] = [];

  const typeConfig: Record<
    ToolType,
    { ext: string; template: () => string; executable: boolean }
  > = {
    node: {
      ext: ".mjs",
      template: () => nodeTemplate(toolName, description),
      executable: true,
    },
    bash: {
      ext: ".sh",
      template: () => bashTemplate(toolName, description),
      executable: true,
    },
    zsh: {
      ext: ".zsh",
      template: () => zshTemplate(toolName, description),
      executable: true,
    },
    text: { ext: ".sh", template: () => "", executable: true }, // handled separately
  };

  if (toolType === "text") {
    const toolFilePath = path.join(outputDir, `${toolName}.tool`);
    const companionFilePath = path.join(outputDir, `${toolName}.sh`);

    if (fs.existsSync(toolFilePath)) return toolFilePath;
    if (fs.existsSync(companionFilePath)) return companionFilePath;

    files.push(
      ...writeToolFile(
        toolFilePath,
        textSchemaTemplate(toolName, description),
        false,
      ),
    );
    files.push(
      ...writeToolFile(
        companionFilePath,
        textCompanionTemplate(toolName),
        true,
      ),
    );
    return files;
  }

  const config = typeConfig[toolType];
  const filePath = path.join(outputDir, `${toolName}${config.ext}`);
  if (fs.existsSync(filePath)) return filePath;

  files.push(...writeToolFile(filePath, config.template(), config.executable));
  return files;
}

function handleToolMake(
  args: string[],
  options: CommandOptions,
  container: Container,
  editor: Editor,
  tui: TUI,
): "continue" | "use" {
  // Parse arguments
  let toolName = "";
  let toolType: ToolType = "bash";
  let description = "";
  let customDir = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--bash") {
      toolType = "bash";
    } else if (arg === "--zsh") {
      toolType = "zsh";
    } else if (arg === "--node") {
      toolType = "node";
    } else if (arg === "--text") {
      toolType = "text";
    } else if (arg === "--description" || arg === "-d") {
      description = args[++i] || "";
    } else if (arg === "--dir") {
      customDir = args[++i] || "";
    } else if (!arg.startsWith("-")) {
      toolName = arg;
    }
  }

  if (!toolName) {
    container.addChild(
      new Text(style.red("Error: Tool name is required"), 0, 1),
    );
    container.addChild(
      new Text(
        style.dim(
          "Usage: /tools make <name> [--bash|--zsh|--node|--text] [--description <desc>] [--dir <path>]",
        ),
        0,
        1,
      ),
    );
    tui.requestRender();
    editor.setText("");
    return "continue";
  }

  if (!TOOL_NAME_REGEX.test(toolName)) {
    container.addChild(
      new Text(
        style.red(`Error: Tool name must match ${TOOL_NAME_REGEX.source}`),
        0,
        1,
      ),
    );
    tui.requestRender();
    editor.setText("");
    return "continue";
  }

  if (!description) {
    description = `Dynamic tool: ${toolName}`;
  }

  // Determine output directory
  const outputDir =
    customDir || path.join(options.workspace.primaryDir, ".acai", "tools");

  // Create directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    const result = createToolFiles(toolName, description, toolType, outputDir);

    if (typeof result === "string") {
      // A file already exists
      container.addChild(
        new Text(style.red(`Error: File already exists: ${result}`), 0, 1),
      );
      tui.requestRender();
      editor.setText("");
      return "continue";
    }

    container.addChild(
      new Text(style.green(`Created tool: ${toolName}`), 0, 1),
    );
    for (const filePath of result) {
      container.addChild(new Text(style.dim(`  ${filePath}`), 0, 1));
    }
    container.addChild(
      new Text(
        style.dim("Restart acai or reload tools to use the new tool."),
        0,
        1,
      ),
    );
  } catch (e) {
    container.addChild(
      new Text(style.red(`Error creating tool: ${(e as Error).message}`), 0, 1),
    );
  }

  tui.requestRender();
  editor.setText("");
  return "continue";
}

async function handleToolList(
  options: CommandOptions,
  container: Container,
  editor: Editor,
  tui: TUI,
): Promise<"continue" | "use"> {
  const projectDir = path.join(options.workspace.primaryDir, ".acai", "tools");
  const userDir = path.join(
    process.env["HOME"] || process.env["USERPROFILE"] || "",
    ".acai",
    "tools",
  );

  const dirs = [
    { label: "User tools", dirPath: userDir },
    { label: "Project tools", dirPath: projectDir },
  ];

  let foundAny = false;

  for (const dir of dirs) {
    if (!fs.existsSync(dir.dirPath)) {
      container.addChild(
        new Text(
          style.dim(`${dir.label}: directory not found (${dir.dirPath})`),
          0,
          1,
        ),
      );
      continue;
    }

    const files = fs.readdirSync(dir.dirPath);
    const toolFiles = files.filter(
      (f) =>
        f.endsWith(".js") ||
        f.endsWith(".mjs") ||
        f.endsWith(".cjs") ||
        f.endsWith(".sh") ||
        f.endsWith(".bash") ||
        f.endsWith(".zsh") ||
        f.endsWith(".py") ||
        f.endsWith(".rb") ||
        f.endsWith(".tool") ||
        (!path.extname(f) &&
          fs.statSync(path.join(dir.dirPath, f)).mode & 0o111),
    );

    if (toolFiles.length === 0) {
      container.addChild(
        new Text(style.dim(`${dir.label}: no tools found`), 0, 1),
      );
      continue;
    }

    foundAny = true;
    container.addChild(new Text(style.bold(dir.label), 0, 1));
    for (const file of toolFiles) {
      container.addChild(new Text(style.dim(`  ${file}`), 0, 1));
    }
  }

  if (!foundAny) {
    container.addChild(new Text(style.dim("No dynamic tools found."), 0, 1));
  }

  tui.requestRender();
  editor.setText("");
  return "continue";
}
