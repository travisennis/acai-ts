import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { platform } from "node:os";
import path from "node:path";
import { config } from "./config.ts";
import { dedent } from "./dedent.ts";
import { getShell } from "./terminal/index.ts";
import { AgentTool } from "./tools/agent.ts";
import { BashTool } from "./tools/bash.ts";
import { CodeInterpreterTool } from "./tools/code-interpreter.ts";
import { DeleteFileTool } from "./tools/delete-file.ts";
import { DirectoryTreeTool } from "./tools/directory-tree.ts";
import { EditFileTool } from "./tools/edit-file.ts";
import { GrepTool } from "./tools/grep.ts";
import type { CompleteToolNames } from "./tools/index.ts";
import { ReadFileTool } from "./tools/read-file.ts";
import { ReadMultipleFilesTool } from "./tools/read-multiple-files.ts";
import { SaveFileTool } from "./tools/save-file.ts";
import { ThinkTool } from "./tools/think.ts";
import { WebFetchTool } from "./tools/web-fetch.ts";
import { WebSearchTool } from "./tools/web-search.ts";
import { getCurrentBranch, inGitDirectory } from "./utils/git.ts";

async function getCustomSystemPrompt(): Promise<string | null> {
  const systemMdPath = path.join(config.project.getPath(), "system.md");
  try {
    const content = await readFile(systemMdPath, "utf8");
    return content.trim() || null;
  } catch {
    // system.md doesn't exist or can't be read
    return null;
  }
}

function intro() {
  return "You are acai, an expert coding assistant.";
}

async function instructions() {
  const systemMdPath = await getCustomSystemPrompt();
  if (systemMdPath) {
    return systemMdPath;
  }

  return `## Core Principles

- **CLI-Optimized**: Be concise and direct - responses appear in a terminal. Be extremely concise. Sacrifice grammar for the sake of concision.
- **Progressive Problem Solving**: Work through problems methodically until resolution.
- **User Authority**: NEVER commit changes or add dependencies without explicit user approval.
- **Security-First**: Prioritize secure coding practices in all suggestions.
- **Completion Focus**: Continue working until the user's query is completely resolved.
- **Expert Level**: Assume the user is an experienced software engineer.

## Response Format

- **Direct Answers**: One-word or concise answers when possible.
- **Code First**: Lead with code snippets for code-related queries.
- **No Fluff**: Avoid preambles or phrases like "Here is the content..."
- **Error Reporting**: Specify error, location, and fix (e.g., \`Error: TypeError at auth.ts:42. Fix: Add null check.\`).

## Work Standards

### Code Quality
- Match existing code conventions and patterns
- Use libraries/utilities already in the project
- Prioritize maintainable, readable code over clever solutions

### Security & Error Handling
- Validate/sanitize all inputs and outputs
- Use parameterized queries for databases
- Never hardcode secrets; prevent injection attacks, XSS, unauthorized access
- Apply principle of least privilege in API integrations
- If a tool fails, ask the user how to proceed
- Report errors with specific locations and suggested fixes`;
}

async function minimalInstructions() {
  const systemMdPath = await getCustomSystemPrompt();
  if (systemMdPath) {
    return systemMdPath;
  }

  return `- Be concise and direct
- Work through problems methodically until resolution
- Continue working until the user's query is completely resolved.
- Assume the user is an experienced software engineer.`;
}

type ToolSection = {
  id: string;
  title: string;
  tools: readonly string[];
  content: (
    activeTools: CompleteToolNames[],
    allActiveTools: CompleteToolNames[],
  ) => string;
  dependencies?: readonly string[];
  alwaysInclude?: boolean;
};

const toolSections: readonly ToolSection[] = [
  {
    id: "information-gathering-file-system",
    title: "#### File System",
    tools: [
      ReadFileTool.name,
      ReadMultipleFilesTool.name,
      GrepTool.name,
      AgentTool.name,
      DirectoryTreeTool.name,
    ] as const,
    content: (_activeTools, allActiveTools) => {
      const lines: string[] = [];

      // Helper to check if tool is active
      const isActive = (tool: string) =>
        allActiveTools.length === 0 ||
        allActiveTools.includes(tool as CompleteToolNames);

      // Read tools
      const readTools: string[] = [];
      if (isActive(ReadFileTool.name))
        readTools.push(`\`${ReadFileTool.name}\``);
      if (isActive(ReadMultipleFilesTool.name))
        readTools.push(`\`${ReadMultipleFilesTool.name}\``);

      if (readTools.length > 0) {
        lines.push(
          `- Use ${readTools.join(" or ")} for file contents if filenames are provided in the prompt. If you do not know the path to a file use one of the following tools to find the files available.`,
        );
      }

      if (isActive(GrepTool.name)) {
        lines.push(`- Use \`${GrepTool.name}\` for code pattern searches`);
      }

      if (isActive(AgentTool.name)) {
        lines.push(
          `- Use \`${AgentTool.name}\` for iterative keyword/file searches. Use this if you need to explore the project to find what you are looking for.`,
        );
      }

      if (isActive(DirectoryTreeTool.name)) {
        lines.push(
          `- Use \`${DirectoryTreeTool.name}\` if you need a high-level overview of the project.`,
        );
      }

      // Add general guidelines that reference specific tools only if those tools are active
      if (isActive(GrepTool.name) && isActive(ReadMultipleFilesTool.name)) {
        lines.push(
          `- Prefer targeted queries: use \`${GrepTool.name}\` for code pattern searches and \`${ReadMultipleFilesTool.name}\` to fetch files. Avoid full directory dumps for large repositories.`,
        );
      }

      // Add general guidelines that don't reference specific tools
      lines.push(
        "- If the contents of files are provided in the prompt, assume the content is up-to-date and use it directly without re-fetching",
      );
      lines.push(
        "- Always verify file contents before suggesting changes unless provided in the prompt",
      );

      return lines.join("\n");
    },
  },
  {
    id: "information-gathering-web",
    title: "#### Web and Internet",
    tools: [WebFetchTool.name, WebSearchTool.name] as const,
    content: (_activeTools, allActiveTools) => {
      const lines: string[] = [];

      const isActive = (tool: string) =>
        allActiveTools.length === 0 ||
        allActiveTools.includes(tool as CompleteToolNames);

      if (isActive(WebFetchTool.name)) {
        lines.push(
          `- Use \`${WebFetchTool.name}\` for text-based URLs provided in the prompt`,
        );
      }

      if (isActive(WebSearchTool.name)) {
        lines.push(
          `- Use \`${WebSearchTool.name}\` for external research (e.g., libraries, errors)`,
        );
      }

      // Add general guideline
      lines.push(
        "- If the contents of URLs are provided in the prompt, assume the content is up-to-date and use it directly without re-fetching",
      );

      return lines.join("\n");
    },
  },
  {
    id: "code-modification",
    title: "### Code Modification",
    tools: [EditFileTool.name, SaveFileTool.name, DeleteFileTool.name] as const,
    content: (_activeTools, allActiveTools) => {
      const lines: string[] = [];

      const isActive = (tool: string) =>
        allActiveTools.length === 0 ||
        allActiveTools.includes(tool as CompleteToolNames);

      if (isActive(EditFileTool.name)) {
        lines.push(`- Use \`${EditFileTool.name}\` to edit existing files`);
      }

      if (isActive(SaveFileTool.name)) {
        lines.push(`- Use \`${SaveFileTool.name}\` to create new files only`);
      }

      if (isActive(DeleteFileTool.name)) {
        lines.push(`- Use \`${DeleteFileTool.name}\` to delete files`);
      }

      return lines.join("\n");
    },
  },
  {
    id: "planning-complex-tasks",
    title: "### Planning & Complex Tasks",
    tools: [ThinkTool.name] as const,
    content: (_activeTools, allActiveTools) => {
      const isActive = (tool: string) =>
        allActiveTools.length === 0 ||
        allActiveTools.includes(tool as CompleteToolNames);

      if (isActive(ThinkTool.name)) {
        return `- Use \`${ThinkTool.name}\` for structured reasoning on complex problems\n- Outline multi-step tasks before execution`;
      }
      return "";
    },
  },
  {
    id: "bash-commands",
    title: `### Bash Commands (\`${BashTool.name}\`)`,
    tools: [BashTool.name] as const,
    content: (_activeTools, allActiveTools) => {
      const isActive = (tool: string) =>
        allActiveTools.length === 0 ||
        allActiveTools.includes(tool as CompleteToolNames);

      if (isActive(BashTool.name)) {
        return `- Execute commands with a sandboxed executor that supports pipes (|), conditional chaining (&&, ||, ;), and redirection (> >> < 2> 2>>).\n- Run single commands or compose multi-step flows using shell operators.\n- For extremely large gh/git messages:\n  1. Create temp file with ${SaveFileTool.name} in the project's .tmp directory\n  2. Use git commit --file path/to/temp/file or gh pr create --title "Title of PR" --body-file path/to/temp/file\n- Note: The .tmp directory in the current working directory is deleted each time the agent shuts down.\n- Commands execute only within the project directory; always use absolute paths.\n- Avoid interactive commands; prefer non-interactive flags (e.g., npm init -y).\n\n#### Tools available via \`${BashTool.name}\`\n\n${getInstalledTools()}\n\n#### Using acai as sub-agent\n\nYou can run acai in cli mode and it will receive a prompt and return a result. This version of acai is a separate process, but it has access to the same system prompt and tools as you do.\n\nHow to run: \`acai -p <prompt>\``;
      }
      return "";
    },
  },
  {
    id: "code-interpreter",
    title: `### Code Interpreter (\`${CodeInterpreterTool.name}\`)`,
    tools: [CodeInterpreterTool.name] as const,
    content: (_activeTools, allActiveTools) => {
      const isActive = (tool: string) =>
        allActiveTools.length === 0 ||
        allActiveTools.includes(tool as CompleteToolNames);

      if (isActive(CodeInterpreterTool.name)) {
        return `- Executes JavaScript code in a separate Node.js process using Node's Permission Model\n- By default, the child process has no permissions except read/write within the current working directory\n- Returns stdout, stderr, and exitCode\n- Use console.log/console.error to produce output`;
      }
      return "";
    },
  },
  {
    id: "git-workflow",
    title: "### Git Workflow",
    tools: [] as const, // This section doesn't have its own tools
    dependencies: [BashTool.name], // Only show if bash tool is active
    content: () => {
      return "- Always stage changes before attempting to commit them\n- Never amend git commits without approval from the user\n- Never use `git add -A` when preparing for multiple, distinct commits; instead, selectively add files or hunks relevant to each commit\n- Always use `git checkout -b <branch-name>` with a branch name that accurately reflects the *type* of changes being made\n- Never stage changes for files that are specified in `.gitignore`\n- Always stage changes after running a formatter that modifies files, before attempting to commit";
    },
  },
  {
    id: "efficiency-guidelines",
    title: "### Efficiency Guidelines",
    tools: [] as const,
    alwaysInclude: true,
    content: () => {
      return "- Always use the most efficient workflow to complete tasks\n- Never re-read file content that has already been provided in the current turn or is directly accessible via a tool; instead, reuse the provided content or reference the file path directly\n- Always use direct file paths or established methods to pass content to tools that accept file input, rather than re-creating content in command strings\n- Always run a build after making code changes to verify correctness";
    },
  },
];

function toolUsage(activeTools: CompleteToolNames[]) {
  const sections: string[] = [];

  // Always include the header
  sections.push("## Tool Usage Guidelines");

  // Helper to check if any of the specified tools are active
  const hasAnyTool = (...tools: string[]): boolean => {
    if (activeTools.length === 0) return true;
    return tools.some((tool) =>
      activeTools.includes(tool as CompleteToolNames),
    );
  };

  // Track if we've added the Information Gathering header
  let addedInformationGatheringHeader = false;

  for (const section of toolSections) {
    // Check if section should be included
    let shouldInclude = false;

    if (section.alwaysInclude) {
      shouldInclude = true;
    } else if (section.tools.length > 0) {
      shouldInclude = hasAnyTool(...section.tools);
    } else if (section.dependencies) {
      shouldInclude = hasAnyTool(...section.dependencies);
    } else {
      // Section with no tools and no dependencies shouldn't be included
      continue;
    }

    if (!shouldInclude) {
      continue;
    }

    // Generate content for the section
    const content = section.content(activeTools, activeTools);
    if (!content.trim()) {
      continue;
    }

    // Handle Information Gathering sections specially
    if (
      section.id === "information-gathering-file-system" ||
      section.id === "information-gathering-web"
    ) {
      if (!addedInformationGatheringHeader) {
        sections.push("\n\n### Information Gathering");
        addedInformationGatheringHeader = true;
      }
      sections.push(`\n\n${section.title}\n${content}`);
    } else {
      sections.push(`\n\n${section.title}\n${content}`);
    }
  }

  return sections.join("");
}

function escalationProcedures() {
  return `## Escalation

- If stuck, state the limitation, suggest alternatives, and ask the user for guidance`;
}

async function getProjectContext() {
  const rules = (await config.readAgentsFile()).trim();
  const learnedRules = (await config.readProjectLearnedRulesFile()).trim();
  let result = "";
  if (rules) {
    result += `## Project Context:\n\n### AGENTS.md for ./\n\n<instructions>\n${rules}\n</instructions>\n`;
  }
  if (learnedRules) {
    if (!rules) {
      result += "## Project Rules:\n\n";
    }
    result += `### Important rules to follow\n\n${learnedRules}`;
  }
  return result.trim();
}

async function environmentInfo() {
  const gitDirectory = await inGitDirectory();
  let gitSection = `- **Is directory a git repo**: ${gitDirectory ? "Yes" : "No"}`;
  if (gitDirectory) {
    gitSection += `\n- **Current git branch**: ${await getCurrentBranch()}`;
  }

  return `## Environment

- **Current working directory**: ${process.cwd()}
${gitSection}
- **Platform**: ${platform()}
- **Shell**: ${getShell()}
- **Today's date**: ${(new Date()).toISOString()}
- Note: The .tmp directory in the current working directory is deleted each time the agent shuts down.`;
}

type SystemPromptOptions = {
  type: "full" | "minimal" | "cli";
  activeTools?: CompleteToolNames[];
  includeRules?: boolean;
};

export async function systemPrompt(options?: SystemPromptOptions) {
  const { type = "full" } = options ?? {};
  switch (type) {
    case "full":
      return fullSystemPrompt(options);
    case "minimal":
      return minSystemPrompt(options);
    case "cli":
      return cliSystemPrompt(options);
    default:
      return fullSystemPrompt(options);
  }
}
async function fullSystemPrompt(options?: SystemPromptOptions) {
  const { activeTools = [], includeRules = true } = options ?? {};

  const prompt = dedent`
${intro()}

${await instructions()}

${toolUsage(activeTools)}

${escalationProcedures()}

${includeRules ? await getProjectContext() : ""}

${await environmentInfo()}
`;

  return prompt;
}

async function minSystemPrompt(options?: SystemPromptOptions) {
  const { activeTools = [], includeRules = true } = options ?? {};

  const prompt = dedent`
${intro()}

${await minimalInstructions()}

${activeTools ? "## Available Tools:" : ""}
${activeTools ? activeTools.map((tool) => `- ${tool}`).join("\n") : ""}

${includeRules ? await getProjectContext() : ""}

${await environmentInfo()}
`;

  return prompt;
}

async function cliSystemPrompt(options?: SystemPromptOptions) {
  const { activeTools } = options ?? {};
  const prompt = dedent`
${intro()}

${await minimalInstructions()}

${activeTools ? "Tools:" : ""}
${activeTools ? activeTools.map((tool) => `- ${tool}`).join("\n") : ""}

${await getProjectContext()}

${await environmentInfo()}
`;

  return prompt;
}

function getInstalledTools() {
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

  const toolStatus = tools
    .map((tool) => {
      let status = false;
      try {
        execSync(tool.command, { stdio: "ignore", timeout: 5000 });
        status = true;
      } catch (_error) {
        // Ignore error, tool is not installed
      }
      return [tool.name, status];
    })
    .filter((tool) => tool[1])
    .map((tool) => `- ${tool[0]}`)
    .join("\n");

  return toolStatus;
}
