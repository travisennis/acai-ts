import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { platform } from "node:os";
import path from "node:path";
import { config } from "./config.ts";

import { dedent } from "./dedent.ts";
import { formatSkillsForPrompt, loadSkills } from "./skills.ts";
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
  return "You are acai. You are running as a coding agent in a CLI on the user's computer.";
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
- **Be Efficient**: When multiple tool calls can be parallelized, make these tool calls in parallel instead of sequential. Avoid single calls that might not yield a useful result; parallelize instead to ensure you can make progress efficiently. Always use the most efficient workflow to complete tasks
- **Default expectation**: Deliver working code, not just a plan. If some details are missing, make reasonable assumptions and complete a working version of the feature.

## Autonomy and Persistence

- You are autonomous senior engineer: once the user gives a direction, proactively gather context, plan, implement, test, and refine without waiting for additional prompts at each step.
- Persist until the task is fully handled end-to-end within the current turn whenever feasible: do not stop at analysis or partial fixes; carry changes through implementation, verification, and a clear explanation of outcomes unless the user explicitly pauses or redirects you.
- Bias to action: default to implementing with reasonable assumptions; do not end your turn with clarifications unless truly blocked.
- Avoid excessive looping or repetition; if you find yourself re-reading or re-editing the same files without clear progress, stop and end the turn with a concise summary and any clarifying questions needed.

## Exploration and reading files

- **Think first.** Before any tool call, decide ALL files/resources you will need.
- **Batch everything.** If you need multiple files (even from different places), read them together.
- **Only make sequential calls if you truly cannot know the next file without seeing a result first.**
- **Workflow:** (a) plan all needed reads → (b) issue one parallel batch → (c) analyze results → (d) repeat if new, unpredictable reads arise.
- Additional notes:
    - Always maximize parallelism. Never read files one-by-one unless logically unavoidable.
    - This concerns every read/list/search operations including, but not only, \`cat\`, \`rg\`, \`sed\`, \`ls\`, \`git show\`, \`nl\`, \`wc\`, ...

## Presenting your work and final message

You are producing plain text that will later be styled by the CLI. Follow these rules exactly. Formatting should make results easy to scan, but not feel mechanical. Use judgment to decide how much structure adds value.
- Default: be very concise; friendly coding teammate tone.
- Format: Use natural language with high-level headings.
- Ask only when needed; suggest ideas; mirror the user's style.
- For substantial work, summarize clearly; follow final‑answer formatting.
- Skip heavy formatting for simple confirmations.
- Don't dump large files you've written; reference paths only.
- No "save/copy this file" - User is on the same machine.
- Offer logical next steps (tests, commits, build) briefly; add verify steps if you couldn't do something.
- For code changes:
  * Lead with a quick explanation of the change, and then give more details on the context covering where and why a change was made. Do not start this explanation with "summary", just jump right in.
  * If there are natural next steps the user may want to take, suggest them at the end of your response. Do not make suggestions if there are no natural next steps.
  * When suggesting multiple options, use numeric lists for the suggestions so the user can quickly respond with a single number.
- The user does not command execution outputs. When asked to show the output of a command (e.g. \`git show\`), relay the important details in your answer or summarize the key lines so the user understands the result.

### Final answer structure and style guidelines

- Plain text; CLI handles styling. Use structure only when it helps scanability.
- Headers: optional; short Title Case (1-3 words) wrapped in **…**; no blank line before the first bullet; add only if they truly help.
- Bullets: use - ; merge related points; keep to one line when possible; 4–6 per list ordered by importance; keep phrasing consistent.
- Monospace: backticks for commands/paths/env vars/code ids and inline examples; use for literal keyword bullets; never combine with **.
- Code samples or multi-line snippets should be wrapped in fenced code blocks; include an info string as often as possible.
- Structure: group related bullets; order sections general → specific → supporting; for subsections, start with a bolded keyword bullet, then items; match complexity to the task.
- Tone: collaborative, concise, factual; present tense, active voice; self‑contained; no "above/below"; parallel wording.
- Don'ts: no nested bullets/hierarchies; no ANSI codes; don't cram unrelated keywords; keep keyword lists short—wrap/reformat if long; avoid naming formatting styles in answers.
- Adaptation: code explanations → precise, structured with code refs; simple tasks → lead with outcome; big changes → logical walkthrough + rationale + next actions; casual one-offs → plain sentences, no headers/bullets.
- File References: When referencing files in your response follow the below rules:
  * Use inline code to make file paths clickable.
  * Each reference should have a stand alone path. Even if it's the same file.
  * Accepted: absolute, workspace‑relative, a/ or b/ diff prefixes, or bare filename/suffix.
  * Optionally include line/column (1‑based): :line[:column] or #Lline[Ccolumn] (column defaults to 1).
  * Do not use URIs like file://, vscode://, or https://.
  * Do not provide range of lines
  * Examples: src/app.ts, src/app.ts:42, b/server/index.js#L10, C:\\repo\\project\\main.rs:12:5

## Tool Calling

<tool_calling>
1. Use only provided tools; follow their schemas exactly.
2. Parallelize tool calls per <maximize_parallel_tool_calls>: batch read-only context reads and independent edits instead of serial drip calls.
3. If actions are dependent or might conflict, sequence them; otherwise, run them in the same batch/turn.
4. Don't mention tool names to the user; describe actions naturally.
5. If info is discoverable via tools, prefer that over asking the user.
6. Read multiple files as needed; don't guess.
7. Give a brief progress note before the first tool call each turn; add another before any new batch and before ending your turn.
8. After any substantive code edit or schema change, run tests/build; fix failures before proceeding or marking tasks complete.
9. Before closing the goal, ensure a green test/build run.
</tool_calling>

<context_understanding>
Grep search (grep and ripgrep) is your MAIN exploration tool.
- CRITICAL: Start with a broad set of queries that capture keywords based on the USER's request and provided context.
- MANDATORY: Run multiple Grep searches in parallel with different patterns and variations; exact matches often miss related code.
- Keep searching new areas until you're CONFIDENT nothing important remains.
- When you have found some relevant code, narrow your search and read the most likely important files.
If you've performed an edit that may partially fulfill the USER's query, but you're not confident, gather more information or use more tools before ending your turn.
Bias towards not asking the user for help if you can find the answer yourself.
</context_understanding>

<maximize_parallel_tool_calls>
CRITICAL INSTRUCTION: For maximum efficiency, whenever you perform multiple operations, invoke all relevant tools concurrently rather than sequentially. Prioritize calling tools in parallel whenever possible. For example, when reading 3 files, run 3 tool calls in parallel to read all 3 files into context at the same time. When running multiple read-only commands, always run all of the commands in parallel. Err on the side of maximizing parallel tool calls rather than running too many tools sequentially.

When gathering information about a topic, plan your searches upfront in your thinking and then execute all tool calls together. For instance, all of these cases SHOULD use parallel tool calls:

- Searching for different patterns (imports, usage, definitions) should happen in parallel
- Multiple grep searches with different regex patterns should run simultaneously
- Reading multiple files or searching different directories can be done all at once
- Combining Glob with Grep for comprehensive results
- Any information gathering where you know upfront what you're looking for

And you should use parallel tool calls in many more cases beyond those listed above.

Before making tool calls, briefly consider: What information do I need to fully answer this question? Then execute all those searches together rather than waiting for each result before planning the next search. Most of the time, parallel tool calls can be used rather than sequential. Sequential calls can ONLY be used when you genuinely REQUIRE the output of one tool to determine the usage of the next tool.

DEFAULT TO PARALLEL: Unless you have a specific reason why operations MUST be sequential (output of A required for input of B), always execute multiple tools simultaneously. This is not just an optimization - it's the expected behavior. Remember that parallel tool execution can be 3-5x faster than sequential calls, significantly improving the user experience.
 </maximize_parallel_tool_calls>

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
    activeTools: CompleteToolNames[] | undefined,
    allActiveTools: CompleteToolNames[] | undefined,
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
        allActiveTools === undefined ||
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
    id: "code-modification",
    title: "### Code Modification",
    tools: [EditFileTool.name, SaveFileTool.name, DeleteFileTool.name] as const,
    content: (_activeTools, allActiveTools) => {
      const lines: string[] = [];

      const isActive = (tool: string) =>
        allActiveTools === undefined ||
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
        allActiveTools === undefined ||
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
        allActiveTools === undefined ||
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
        allActiveTools === undefined ||
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

function toolUsage(activeTools?: CompleteToolNames[]) {
  const sections: string[] = [];

  // Always include the header
  sections.push("## Tool Usage Guidelines");

  // Helper to check if any of the specified tools are active
  const hasAnyTool = (...tools: string[]): boolean => {
    // If activeTools is undefined, all tools are active
    if (activeTools === undefined) return true;
    // If activeTools is empty array, no tools are active
    if (activeTools.length === 0) return false;
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

async function getProjectContext() {
  const rules = (await config.readAgentsFile()).trim();
  const learnedRules = (await config.readProjectLearnedRulesFile()).trim();
  let result = "";
  if (rules) {
    result += `## Project Context:\n\n### AGENTS.md for ./\n\n<instructions>\n${rules}\n</instructions>\n\n`;
  }
  if (learnedRules) {
    if (!rules) {
      result += "## Project Rules:\n\n";
    }
    result += `### Important rules to follow\n\n${learnedRules}`;
  }
  return result.trim();
}

async function environmentInfo(allowedDirs: string[]) {
  const gitDirectory = await inGitDirectory();
  let gitSection = `- **Is directory a git repo**: ${gitDirectory ? "Yes" : "No"}`;
  if (gitDirectory) {
    gitSection += `\n- **Current git branch**: ${await getCurrentBranch()}`;
  }

  return `## Environment

### Allowed directories:

${allowedDirs.map((dir) => `- ${dir}`).join("\n")}

### Information:

${gitSection}
- **Platform**: ${platform()}
- **Shell**: ${getShell()}
- **Today's date**: ${new Date().toISOString().split("T")[0]}

- Note: The .tmp directory in the current working directory is deleted each time the agent shuts down.`;
}

type SystemPromptOptions = {
  type: "full" | "minimal" | "cli";
  allowedDirs?: string[];
  activeTools?: CompleteToolNames[];
  includeRules?: boolean;
  skillsEnabled?: boolean;
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

const DEFAULT_ALLOWED_DIRS = [process.cwd()];

async function fullSystemPrompt(options?: SystemPromptOptions) {
  const {
    allowedDirs = DEFAULT_ALLOWED_DIRS,
    includeRules = true,
    skillsEnabled = true,
  } = options ?? {};

  const instructionsText = await instructions();
  const projectContextText = includeRules ? await getProjectContext() : "";
  const environmentInfoText = await environmentInfo(allowedDirs);

  let skillsText = "";
  if (skillsEnabled) {
    const skills = await loadSkills();
    skillsText = formatSkillsForPrompt(skills);
  }

  const prompt = dedent`
${intro()}

${instructionsText}

${projectContextText}

${environmentInfoText}${skillsText}
`;

  return prompt;
}

async function minSystemPrompt(options?: SystemPromptOptions) {
  const {
    allowedDirs = DEFAULT_ALLOWED_DIRS,
    activeTools = undefined,
    includeRules = true,
    skillsEnabled = true,
  } = options ?? {};
  const minimalInstructionsText = await minimalInstructions();
  const projectContextText = includeRules ? await getProjectContext() : "";
  const environmentInfoText = await environmentInfo(allowedDirs);

  let skillsText = "";
  if (skillsEnabled) {
    const skills = await loadSkills();
    skillsText = formatSkillsForPrompt(skills);
  }

  const prompt = dedent`
${intro()}

${minimalInstructionsText}

${toolUsage(activeTools)}

${projectContextText}

${environmentInfoText}${skillsText}
`;

  return prompt;
}

async function cliSystemPrompt(options?: SystemPromptOptions) {
  const {
    allowedDirs = DEFAULT_ALLOWED_DIRS,
    activeTools = undefined,
    skillsEnabled = true,
  } = options ?? {};
  const minimalInstructionsText = await minimalInstructions();
  const projectContextText = await getProjectContext();
  const environmentInfoText = await environmentInfo(allowedDirs);

  let skillsText = "";
  if (skillsEnabled) {
    const skills = await loadSkills();
    skillsText = formatSkillsForPrompt(skills);
  }

  const prompt = dedent`
${intro()}

${minimalInstructionsText}

${activeTools && activeTools.length > 0 ? "Tools:" : ""}
${activeTools && activeTools.length > 0 ? activeTools.map((tool) => `- ${tool}`).join("\n") : ""}

${projectContextText}

${environmentInfoText}${skillsText}
`;

  return prompt;
}

function getInstalledTools() {
  // Check for required bash tools
  const tools = [
    {
      name: "git",
      command: "git --version",
      description:
        "Version control system - used for cloning repositories, checking out branches, committing changes, viewing history, and managing code versions",
    },
    {
      name: "gh",
      command: "gh --version",
      description:
        "GitHub CLI - used for creating pull requests, managing issues, interacting with GitHub API, and automating GitHub workflows",
    },
    {
      name: "rg",
      command: "rg --version",
      description:
        "ripgrep - fast text search tool for searching code patterns, file contents, and regular expressions across the codebase (use this instead of grep)",
    },
    {
      name: "fd",
      command: "fd --version",
      description:
        "Fast file finder - alternative to find command, used for finding files by name, pattern, or type with intuitive syntax (use this instead of find)",
    },
    {
      name: "ast-grep",
      command: "ast-grep --version",
      description:
        "AST-based code search - used for structural code search, refactoring, finding patterns in abstract syntax trees, and code transformations",
    },
    {
      name: "jq",
      command: "jq --version",
      description:
        "JSON processor - used for parsing, filtering, and manipulating JSON output from APIs, commands, and configuration files",
    },
    {
      name: "yq",
      command: "yq --version",
      description:
        "YAML processor - used for parsing and manipulating YAML files (configs, CI/CD pipelines, Kubernetes manifests) with jq-like syntax",
    },
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
      return { name: tool.name, description: tool.description, status };
    })
    .filter((tool) => tool.status)
    .map((tool) => `- **${tool.name}**: ${tool.description}`)
    .join("\n");

  return toolStatus;
}
