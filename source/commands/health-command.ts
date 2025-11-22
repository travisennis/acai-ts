import { execSync } from "node:child_process";
import { formatMemoryUsage } from "../formatting.ts";
import type { Editor, TUI } from "../tui/index.ts";
import { Container, Modal, ModalTable, ModalText } from "../tui/index.ts";
import type { CommandOptions, ReplCommand } from "./types.ts";

export function healthCommand(
  { terminal }: CommandOptions,
  execFn = execSync,
): ReplCommand {
  return {
    command: "/health",
    description: "Show application health status and environment variables",

    getSubCommands: () => Promise.resolve([]),
    async execute(): Promise<"break" | "continue" | "use"> {
      // Define the environment variables we care about
      const envVars = [
        // AI Provider API Keys
        { name: "OPENAI_API_KEY", description: "OpenAI (GPT models)" },
        { name: "ANTHROPIC_API_KEY", description: "Anthropic (Claude models)" },
        {
          name: "GOOGLE_GENERATIVE_AI_API_KEY",
          description: "Google (Gemini models)",
        },
        { name: "DEEPSEEK_API_KEY", description: "DeepSeek" },
        { name: "GROQ_API_KEY", description: "Groq (multiple models)" },
        { name: "X_AI_API_KEY", description: "X.AI (Grok models)" },
        { name: "XAI_API_KEY", description: "X.AI (Grok models - alt)" },
        {
          name: "OPENROUTER_API_KEY",
          description: "OpenRouter (multiple models)",
        },

        // Web Service API Keys
        { name: "EXA_API_KEY", description: "Exa (enhanced web search)" },
        {
          name: "JINA_READER_API_KEY",
          description: "Jina Reader (web content extraction)",
        },

        // Application Configuration
        { name: "LOG_LEVEL", description: "Logging level" },
      ];

      // Check each environment variable
      const envStatus: (string | number)[][] = envVars.map((envVar) => {
        const value = process.env[envVar.name];
        const hasValue =
          value !== undefined && value !== null && value.trim() !== "";
        const status = hasValue ? "✓ Set" : "✗ Not set";

        return [envVar.name, status, envVar.description];
      });

      // Display the table
      terminal.writeln("Environment Variables Status:");
      terminal.table(envStatus, {
        header: ["Variable", "Status", "Description"],
        colWidths: [30, 15, 55],
      });

      // Count how many are set (derived from envStatus to avoid re-checking process.env)
      const setCount = envStatus.filter((row) => row[1] === "✓ Set").length;
      const totalCount = envVars.length;

      terminal.info(
        `Summary: ${setCount}/${totalCount} environment variables are set`,
      );

      if (setCount === 0) {
        terminal.warn(
          "⚠️  No AI provider API keys are configured. The app may not function properly.",
        );
      } else {
        terminal.info("✓ At least one AI provider is configured.");
      }

      // Check for required bash tools
      const tools = [
        { name: "git", command: "git --version" },
        { name: "gh", command: "gh --version" },
        { name: "rg", command: "rg --version" },
        { name: "fd", command: "fd --version" },
        { name: "ast-grep", command: "ast-grep --version" },
        { name: "jq", command: "jq --version" },
        { name: "yq", command: "yq --version" },
      ];

      const toolStatus: string[][] = tools.map((tool) => {
        let status = "✗ Not installed";
        try {
          execFn(tool.command, { stdio: "ignore", timeout: 5000 });
          status = "✓ Installed";
        } catch (_error) {
          // Ignore error, tool is not installed
        }
        return [tool.name, status];
      });

      terminal.lineBreak();
      terminal.writeln("Bash Tools Status:");
      terminal.table(toolStatus, {
        header: ["Tool", "Status"],
        colWidths: [15, 20],
      });

      const installedCount = toolStatus.filter(
        (row) => row[1] === "✓ Installed",
      ).length;
      const totalTools = tools.length;
      terminal.info(
        `Tool Summary: ${installedCount}/${totalTools} tools are installed.`,
      );

      if (installedCount < totalTools) {
        terminal.warn(
          "⚠️  Some tools are missing. Install them for full functionality.",
        );
      } else {
        terminal.info("✓ All required tools are installed.");
      }

      terminal.lineBreak();
      terminal.writeln("Current Process:");
      // Display memory usage
      const usage = process.memoryUsage().rss;
      const formattedUsage = formatMemoryUsage(usage);

      if (usage >= 2 * 1024 * 1024 * 1024) {
        terminal.error(`Memory Usage: ${formattedUsage}`);
      } else {
        terminal.info(`Memory Usage: ${formattedUsage}`);
      }

      return "continue";
    },
    async handle(
      _args: string[],
      { tui, editor }: { tui: TUI; container: Container; editor: Editor },
    ): Promise<"break" | "continue" | "use"> {
      // Define the environment variables we care about
      const envVars = [
        // AI Provider API Keys
        { name: "OPENAI_API_KEY", description: "OpenAI (GPT models)" },
        { name: "ANTHROPIC_API_KEY", description: "Anthropic (Claude models)" },
        {
          name: "GOOGLE_GENERATIVE_AI_API_KEY",
          description: "Google (Gemini models)",
        },
        { name: "DEEPSEEK_API_KEY", description: "DeepSeek" },
        { name: "GROQ_API_KEY", description: "Groq (multiple models)" },
        { name: "X_AI_API_KEY", description: "X.AI (Grok models)" },
        { name: "XAI_API_KEY", description: "X.AI (Grok models - alt)" },
        {
          name: "OPENROUTER_API_KEY",
          description: "OpenRouter (multiple models)",
        },

        // Web Service API Keys
        { name: "EXA_API_KEY", description: "Exa (enhanced web search)" },
        {
          name: "JINA_READER_API_KEY",
          description: "Jina Reader (web content extraction)",
        },

        // Application Configuration
        { name: "LOG_LEVEL", description: "Logging level" },
      ];

      // Check each environment variable
      const envStatus: (string | number)[][] = envVars.map((envVar) => {
        const value = process.env[envVar.name];
        const hasValue =
          value !== undefined && value !== null && value.trim() !== "";
        const status = hasValue ? "✓ Set" : "✗ Not set";

        return [envVar.name, status, envVar.description];
      });

      // Check for required bash tools
      const tools = [
        { name: "git", command: "git --version" },
        { name: "gh", command: "gh --version" },
        { name: "rg", command: "rg --version" },
        { name: "fd", command: "fd --version" },
        { name: "ast-grep", command: "ast-grep --version" },
        { name: "jq", command: "jq --version" },
        { name: "yq", command: "yq --version" },
      ];

      const toolStatus: string[][] = tools.map((tool) => {
        let status = "✗ Not installed";
        try {
          execFn(tool.command, { stdio: "ignore", timeout: 5000 });
          status = "✓ Installed";
        } catch (_error) {
          // Ignore error, tool is not installed
        }
        return [tool.name, status];
      });

      // Count how many are set
      const setCount = envStatus.filter((row) => row[1] === "✓ Set").length;
      const totalCount = envVars.length;
      const installedCount = toolStatus.filter(
        (row) => row[1] === "✓ Installed",
      ).length;
      const totalTools = tools.length;

      // Display memory usage
      const usage = process.memoryUsage().rss;
      const formattedUsage = formatMemoryUsage(usage);

      // Build modal content
      const modalContent = new Container();

      // Environment variables section
      modalContent.addChild(
        new ModalText("Environment Variables Status:", 0, 1),
      );
      modalContent.addChild(
        new ModalTable(envStatus, ["Variable", "Status", "Description"]),
      );

      const envSummary = `Summary: ${setCount}/${totalCount} environment variables are set`;
      modalContent.addChild(new ModalText(envSummary, 0, 1));

      if (setCount === 0) {
        modalContent.addChild(
          new ModalText(
            "⚠️  No AI provider API keys are configured. The app may not function properly.",
            0,
            1,
          ),
        );
      } else {
        modalContent.addChild(
          new ModalText("✓ At least one AI provider is configured.", 0, 1),
        );
      }

      // Tools section
      modalContent.addChild(new ModalText("", 0, 1)); // Spacer
      modalContent.addChild(new ModalText("Bash Tools Status:", 0, 1));
      modalContent.addChild(new ModalTable(toolStatus, ["Tool", "Status"]));

      const toolSummary = `Tool Summary: ${installedCount}/${totalTools} tools are installed.`;
      modalContent.addChild(new ModalText(toolSummary, 0, 1));

      if (installedCount < totalTools) {
        modalContent.addChild(
          new ModalText(
            "⚠️  Some tools are missing. Install them for full functionality.",
            0,
            1,
          ),
        );
      } else {
        modalContent.addChild(
          new ModalText("✓ All required tools are installed.", 0, 1),
        );
      }

      // Memory usage
      modalContent.addChild(new ModalText("", 0, 1)); // Spacer
      modalContent.addChild(new ModalText("Current Process:", 0, 1));

      const memoryText =
        usage >= 2 * 1024 * 1024 * 1024
          ? `Memory Usage: ${formattedUsage}`
          : `Memory Usage: ${formattedUsage}`;
      modalContent.addChild(new ModalText(memoryText, 0, 1));

      // Create and show modal
      const modal = new Modal("Health Status", modalContent, true, () => {
        // Modal closed callback
        editor.setText("");
        tui.requestRender();
      });

      tui.showModal(modal);
      return "continue";
    },
  };
}
