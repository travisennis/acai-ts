import { execSync } from "node:child_process";

export interface EnvVarInfo {
  name: string;
  description: string;
}

export interface ToolInfo {
  name: string;
  command: string;
}

export const ENVIRONMENT_VARIABLES: EnvVarInfo[] = [
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
  { name: "OPENROUTER_API_KEY", description: "OpenRouter (multiple models)" },
  { name: "OPENCODE_ZEN_API_TOKEN", description: "OpenCode Zen" },
  { name: "EXA_API_KEY", description: "Exa (Web Search)" },
  {
    name: "JINA_READER_API_KEY",
    description: "Jina AI (Web Fetch HTML cleaning)",
  },
  { name: "LOG_LEVEL", description: "Logging level" },
];

export const BASH_TOOLS: ToolInfo[] = [
  { name: "git", command: "git --version" },
  { name: "gh", command: "gh --version" },
  { name: "rg", command: "rg --version" },
  { name: "fd", command: "fd --version" },
  { name: "ast-grep", command: "ast-grep --version" },
  { name: "jq", command: "jq --version" },
  { name: "yq", command: "yq --version" },
];

export function checkEnvironmentVariables(): (string | number)[][] {
  return ENVIRONMENT_VARIABLES.map((envVar) => {
    const value = process.env[envVar.name];
    const hasValue =
      value !== undefined && value !== null && value.trim() !== "";
    const status = hasValue ? "✓ Set" : "✗ Not set";

    return [envVar.name, status, envVar.description];
  });
}

export function checkTools(
  execFn: (command: string, options: object) => void = execSync,
): string[][] {
  return BASH_TOOLS.map((tool) => {
    let status = "✗ Not installed";
    try {
      execFn(tool.command, { stdio: "ignore", timeout: 5000 });
      status = "✓ Installed";
    } catch {
      // Ignore error, tool is not installed
    }
    return [tool.name, status];
  });
}

export function formatEnvStatus(
  status: (string | number)[][],
): (string | number)[][] {
  return status;
}

export function formatToolStatus(status: string[][]): string[][] {
  return status;
}
