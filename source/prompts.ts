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
import { getCurrentBranch, inGitDirectory } from "./tools/git-utils.ts";
import { GrepTool } from "./tools/grep.ts";
import type { CompleteToolNames } from "./tools/index.ts";
import { ReadFileTool } from "./tools/read-file.ts";
import { ReadMultipleFilesTool } from "./tools/read-multiple-files.ts";
import { SaveFileTool } from "./tools/save-file.ts";
import { ThinkTool } from "./tools/think.ts";
import { WebFetchTool } from "./tools/web-fetch.ts";
import { WebSearchTool } from "./tools/web-search.ts";

async function getCustomSystemPrompt() {
  const systemMdPath = path.join(config.project.getPath(), "system.md");
  try {
    const content = await readFile(systemMdPath, "utf8");
    if (content.trim()) {
      return content;
    }
  } catch {
    // system.md doesn't exist or is empty, use default instructions
    return null;
  }
  return null;
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

function toolUsage(activeTools: CompleteToolNames[]) {
  // Helper function to check if a specific tool is active
  // If activeTools is empty, include everything (backward compatibility)
  function isToolActive(tool: string): boolean {
    if (activeTools.length === 0) return true;
    return activeTools.includes(tool as CompleteToolNames);
  }

  // Helper function to check if any of the specified tools are active
  function hasAnyTool(...tools: string[]): boolean {
    if (activeTools.length === 0) return true;
    return tools.some((tool) =>
      activeTools.includes(tool as CompleteToolNames),
    );
  }

  const sections: string[] = [];

  // Always include the header
  sections.push("## Tool Usage Guidelines");

  // Information Gathering - File System
  const hasFileSystemTools = hasAnyTool(
    ReadFileTool.name,
    ReadMultipleFilesTool.name,
    GrepTool.name,
    AgentTool.name,
    DirectoryTreeTool.name,
  );

  if (hasFileSystemTools) {
    const fileSystemLines: string[] = [];

    // Build file system instructions dynamically based on active tools
    if (
      isToolActive(ReadFileTool.name) ||
      isToolActive(ReadMultipleFilesTool.name)
    ) {
      const readTools: string[] = [];
      if (isToolActive(ReadFileTool.name))
        readTools.push(`\`${ReadFileTool.name}\``);
      if (isToolActive(ReadMultipleFilesTool.name))
        readTools.push(`\`${ReadMultipleFilesTool.name}\``);

      fileSystemLines.push(
        `- Use ${readTools.join(" or ")} for file contents if filenames are provided in the prompt. If you do not know the path to a file use one of the following tools to find the files available.`,
      );
    }

    if (isToolActive(GrepTool.name)) {
      fileSystemLines.push(
        `- Use \`${GrepTool.name}\` for code pattern searches`,
      );
    }

    if (isToolActive(AgentTool.name)) {
      fileSystemLines.push(
        `- Use \`${AgentTool.name}\` for iterative keyword/file searches. Use this if you need to explore the project to find what you are looking for.`,
      );
    }

    if (isToolActive(DirectoryTreeTool.name)) {
      fileSystemLines.push(
        `- Use \`${DirectoryTreeTool.name}\` if you need a high-level overview of the project.`,
      );
    }

    // Add general guidelines that reference specific tools only if those tools are active
    if (
      isToolActive(GrepTool.name) &&
      isToolActive(ReadMultipleFilesTool.name)
    ) {
      fileSystemLines.push(
        `- Prefer targeted queries: use \`${GrepTool.name}\` for code pattern searches and \`${ReadMultipleFilesTool.name}\` to fetch files. Avoid full directory dumps for large repositories.`,
      );
    }

    // Add general guidelines that don't reference specific tools
    fileSystemLines.push(
      "- If the contents of files are provided in the prompt, assume the content is up-to-date and use it directly without re-fetching",
    );
    fileSystemLines.push(
      "- Always verify file contents before suggesting changes unless provided in the prompt",
    );

    sections.push(`

### Information Gathering

#### File System
${fileSystemLines.join("\n")}`);
  }

  // Information Gathering - Web and Internet
  const hasWebTools = hasAnyTool(WebFetchTool.name, WebSearchTool.name);

  if (hasWebTools) {
    const webLines: string[] = [];

    if (isToolActive(WebFetchTool.name)) {
      webLines.push(
        `- Use \`${WebFetchTool.name}\` for text-based URLs provided in the prompt`,
      );
    }

    if (isToolActive(WebSearchTool.name)) {
      webLines.push(
        `- Use \`${WebSearchTool.name}\` for external research (e.g., libraries, errors)`,
      );
    }

    // Add general guideline
    webLines.push(
      "- If the contents of URLs are provided in the prompt, assume the content is up-to-date and use it directly without re-fetching",
    );

    sections.push(`

#### Web and Internet

${webLines.join("\n")}`);
  }

  // Code Modification
  const hasCodeModificationTools = hasAnyTool(
    EditFileTool.name,
    SaveFileTool.name,
    DeleteFileTool.name,
  );

  if (hasCodeModificationTools) {
    const codeModLines: string[] = [];

    if (isToolActive(EditFileTool.name)) {
      codeModLines.push(
        `- Use \`${EditFileTool.name}\` to edit existing files`,
      );
    }

    if (isToolActive(SaveFileTool.name)) {
      codeModLines.push(
        `- Use \`${SaveFileTool.name}\` to create new files only`,
      );
    }

    if (isToolActive(DeleteFileTool.name)) {
      codeModLines.push(`- Use \`${DeleteFileTool.name}\` to delete files`);
    }

    sections.push(`

### Code Modification
${codeModLines.join("\n")}`);
  }

  // Planning & Complex Tasks
  const hasThinkTool = hasAnyTool(ThinkTool.name);

  if (hasThinkTool) {
    sections.push(`

### Planning & Complex Tasks
- Use \`${ThinkTool.name}\` for structured reasoning on complex problems
- Outline multi-step tasks before execution`);
  }

  // Bash Commands
  const hasBashTool = hasAnyTool(BashTool.name);

  if (hasBashTool) {
    sections.push(`

### Bash Commands (\`${BashTool.name}\`)
- Execute commands with a sandboxed executor that supports pipes (|), conditional chaining (&&, ||, ;), and redirection (> >> < 2> 2>>).
- Run single commands or compose multi-step flows using shell operators.
- For extremely large gh/git messages:
  1. Create temp file with ${SaveFileTool.name} in the project's .tmp directory
  2. Use git commit --file path/to/temp/file or gh pr create --title "Title of PR" --body-file path/to/temp/file
- Note: The .tmp directory in the current working directory is deleted each time the agent shuts down.
- Commands execute only within the project directory; always use absolute paths.
- Avoid interactive commands; prefer non-interactive flags (e.g., npm init -y).

#### Tools available via \`${BashTool.name}\`

${getInstalledTools()}

#### Using acai as sub-agent

You can run acai in cli mode and it will receive a prompt and return a result. This version of acai is a separate process, but it has access to the same system prompt and tools as you do.

How to run: \`acai -p <prompt>\``);
  }

  // Code Interpreter
  const hasCodeInterpreterTool = hasAnyTool(CodeInterpreterTool.name);

  if (hasCodeInterpreterTool) {
    sections.push(`

### Code Interpreter (\`${CodeInterpreterTool.name}\`)
- Executes JavaScript code in a separate Node.js process using Node's Permission Model
- By default, the child process has no permissions except read/write within the current working directory
- Returns stdout, stderr, and exitCode
- Use console.log/console.error to produce output`);
  }

  // Git Workflow (only if bash tool is active)
  if (hasBashTool) {
    sections.push(`

### Git Workflow
- Always stage changes before attempting to commit them
- Never amend git commits without approval from the user
- Never use \`git add -A\` when preparing for multiple, distinct commits; instead, selectively add files or hunks relevant to each commit
- Always use \`git checkout -b <branch-name>\` with a branch name that accurately reflects the *type* of changes being made
- Never stage changes for files that are specified in \`.gitignore\`
- Always stage changes after running a formatter that modifies files, before attempting to commit`);
  }

  // Efficiency Guidelines (always included)
  sections.push(`

### Efficiency Guidelines
- Always use the most efficient workflow to complete tasks
- Never re-read file content that has already been provided in the current turn or is directly accessible via a tool; instead, reuse the provided content or reference the file path directly
- Always use direct file paths or established methods to pass content to tools that accept file input, rather than re-creating content in command strings
- Always run a build after making code changes to verify correctness`);

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
    result += `## Project Context:\n\n### ./AGENTS.md\n\n${rules}\n`;
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
