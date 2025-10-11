import { execSync } from "node:child_process";
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
      terminal.info("Environment Variables Status:");
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
      terminal.info("Bash Tools Status:");
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

      return "continue";
    },
  };
}
