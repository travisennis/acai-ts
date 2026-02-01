import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { initExecutionEnvironment } from "../execution/index.ts";
import type { WorkspaceContext } from "../index.ts";
import { logger } from "../logger.ts";
import style from "../terminal/style.ts";
import { resolveCwd, validatePaths } from "../utils/bash.ts";
import {
  detectDestructiveCommand,
  formatBlockedCommandMessage,
} from "../utils/command-protection.ts";
import { convertNullString } from "../utils/zod.ts";
import type { ToolExecutionOptions } from "./types.ts";

/**
 * Detects git commit commands with multi-line -m messages that will fail in shell.
 * Writes the message to a temp file and returns an error with the file path.
 * Returns null if the command is safe.
 */
function detectMultilineGitCommit(command: string): string | null {
  const trimmed = command.trim();

  // Check if it's a git commit command
  if (!trimmed.startsWith("git commit") && !trimmed.startsWith("git ")) {
    return null;
  }

  // Look for -m or -am flags with a message containing newlines
  // Match patterns like: git commit -m "message\nwith\nnewlines"
  // or: git commit -am "message\nwith\nnewlines"
  // Using [\s\S] instead of [^] to match any character including newlines
  const messageMatch = trimmed.match(/-am?\s+["']([\s\S]*?)["']/);
  if (!messageMatch) {
    return null;
  }

  const message = messageMatch[1];
  if (message.includes("\n")) {
    const randomId = randomBytes(4).toString("hex");
    const commitMsgPath = `/tmp/acai/commit-msg-${randomId}.txt`;
    try {
      mkdirSync(dirname(commitMsgPath), { recursive: true });
      writeFileSync(commitMsgPath, message, "utf-8");
    } catch (error) {
      logger.error(error, "Failed to write commit message to temp file");
    }
    return `Multi-line commit messages with -m flag cause shell parsing errors. The commit message has been written to:
  ${commitMsgPath}
Use: git commit -F ${commitMsgPath}`;
  }

  return null;
}

export const BashTool = {
  name: "Bash" as const,
};

const installedTools = getInstalledTools();

const toolDescription = `Execute commands in a shell. Commands can execute only within the allowed directories. Always use absolute paths. Working directory persists between commands; shell state (everything else) does not. The shell environment is initialized from the user's profile (bash or zsh).

IMPORTANT: This tool is for terminal operations like git, npm, docker, etc. DO NOT use it for file operations (reading, writing, editing, searching, finding files) - use the specialized tools for this instead.

Before executing the command, please follow these steps:

1. Directory Verification:
   - If the command will create new directories or files, first use \`ls\` to verify the parent directory exists and is the correct location
   - For example, before running "mkdir foo/bar", first use \`ls foo\` to check that "foo" exists and is the intended parent directory

2. Command Execution:
   - Always quote file paths that contain spaces with double quotes (e.g., cd "path with spaces/file.txt")
   - Examples of proper quoting:
     - cd "/Users/name/My Documents" (correct)
     - cd /Users/name/My Documents (incorrect - will fail)
     - python "/path/with spaces/script.py" (correct)
     - python /path/with spaces/script.py (incorrect - will fail)
   - After ensuring proper quoting, execute the command.
   - Capture the output of the command.

Usage notes:
  - The command argument is required.
  - You can specify an optional timeout in milliseconds (up to 600000ms / 10 minutes). If not specified, commands will timeout after 120000ms (2 minutes).
  - It is very helpful if you write a clear, concise description of what this command does. For simple commands, keep it brief (5-10 words). For complex commands (piped commands, obscure flags, or anything hard to understand at a glance), add enough context to clarify what it does.
  - If the output exceeds 30000 characters, output will be truncated before being returned to you.
  
  - You can use the \`background\` parameter to run the command in the background. Only use this if you don't need the result immediately and are OK being notified when the command completes later. You do not need to check the output right away - you'll be notified when it finishes. You do not need to use '&' at the end of the command when using this parameter.
  
  - Avoid using Bash with the \`find\`, \`grep\`, \`cat\`, \`head\`, \`tail\`, \`sed\`, \`awk\`, or \`echo\` commands, unless explicitly instructed or when these commands are truly necessary for the task. Instead, always prefer using the dedicated tools for these commands:
    - File listing: Use LS or DirectoryTree (not ls)
    - File search: Use Glob (NOT find or ls)
    - Content search: Use Grep (NOT grep or rg)
    - Read files: Use Read (NOT cat/head/tail)
    - Edit files: Use Edit (NOT sed/awk)
    - Write files: Use Write (NOT echo >/cat <<EOF)
    - Communication: Output text directly (NOT echo/printf)
  - When issuing multiple commands:
    - If the commands are independent and can run in parallel, make multiple Bash tool calls in a single message. For example, if you need to run "git status" and "git diff", send a single message with two Bash tool calls in parallel.
    - If the commands depend on each other and must run sequentially, use a single Bash call with '&&' to chain them together (e.g., \`git add . && git commit -m "message" && git push\`). For instance, if one operation must complete before another starts (like mkdir before cp, Write before Bash for git operations, or git add before git commit), run these operations sequentially instead.
    - Use ';' only when you need to run commands sequentially but don't care if earlier commands fail
    - DO NOT use newlines to separate commands (newlines are ok in quoted strings)
  - Try to maintain your current working directory throughout the session by using absolute paths and avoiding usage of \`cd\`. You may use \`cd\` if the User explicitly requests it.
    <good-example>
    pytest /foo/bar/tests
    </good-example>
    <bad-example>
    cd /foo/bar && pytest tests
    </bad-example>

### Committing changes with git

Only create commits when requested by the user. If unclear, ask first. When the user asks you to create a new git commit, follow these steps carefully:

Git Safety Protocol:
- NEVER update the git config
- NEVER run destructive git commands (push --force, reset --hard, checkout ., restore ., clean -f, branch -D) unless the user explicitly requests these actions. Taking unauthorized destructive actions is unhelpful and can result in lost work, so it's best to ONLY run these commands when given direct instructions 
- NEVER skip hooks (--no-verify, --no-gpg-sign, etc) unless the user explicitly requests it
- NEVER run force push to main/master, warn the user if they request it
- CRITICAL: Always create NEW commits rather than amending, unless the user explicitly requests a git amend. When a pre-commit hook fails, the commit did NOT happen  — so --amend would modify the PREVIOUS commit, which may result in destroying work or losing previous changes. Instead, after hook failure, fix the issue, re-stage, and create a NEW commit
- When staging files, prefer adding specific files by name rather than using "git add -A" or "git add .", which can accidentally include sensitive files (.env, credentials) or large binaries
- NEVER commit changes unless the user explicitly asks you to. It is VERY IMPORTANT to only commit when explicitly asked, otherwise the user will feel that you are being too proactive

1. You can call multiple tools in a single response. When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance. run the following bash commands in parallel, each using the Bash tool:
  - Run a git status command to see all untracked files. IMPORTANT: Never use the -uall flag as it can cause memory issues on large repos.
  - Run a git diff command to see both staged and unstaged changes that will be committed.
  - Run a git log command to see recent commit messages, so that you can follow this repository's commit message style.
2. Analyze all staged changes (both previously staged and newly added) and draft a commit message:
  - Summarize the nature of the changes (eg. new feature, enhancement to an existing feature, bug fix, refactoring, test, docs, etc.). Ensure the message accurately reflects the changes and their purpose (i.e. "add" means a wholly new feature, "update" means an enhancement to an existing feature, "fix" means a bug fix, etc.).
  - Do not commit files that likely contain secrets (.env, credentials.json, etc). Warn the user if they specifically request to commit those files
  - Draft a concise (1-2 sentences) commit message that focuses on the "why" rather than the "what"
  - Ensure it accurately reflects the changes and their purpose
3. You can call multiple tools in a single response. When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance. run the following commands:
   - Add relevant untracked files to the staging area.
   - Run git status after the commit completes to verify success.
   Note: git status depends on the commit completing, so run it sequentially after the commit.
4. If the commit fails due to pre-commit hook: fix the issue and create a NEW commit

Important notes:
- NEVER run additional commands to read or explore code, besides git bash commands
- DO NOT push to the remote repository unless the user explicitly asks you to do so
- IMPORTANT: Never use git commands with the -i flag (like git rebase -i or git add -i) since they require interactive input which is not supported.
- IMPORTANT: Do not use --no-edit with git rebase commands, as the --no-edit flag is not a valid option for git rebase.
- If there are no changes to commit (i.e., no untracked files and no modifications), do not create an empty commit
- In order to ensure good formatting, ALWAYS pass the commit message via a HEREDOC, a la this example:
<example>
git commit -m "$(cat <<'EOF'
   Commit message here.
   EOF
   )"
</example>

### Creating pull requests
Use the gh command via the Bash tool for ALL GitHub-related tasks including working with issues, pull requests, checks, and releases. If given a Github URL use the gh command to get the information needed.

IMPORTANT: When the user asks you to create a pull request, follow these steps carefully:

1. You can call multiple tools in a single response. When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance. run the following bash commands in parallel using the Bash tool, in order to understand the current state of the branch since it diverged from the main branch:
   - Run a git status command to see all untracked files (never use -uall flag)
   - Run a git diff command to see both staged and unstaged changes that will be committed
   - Check if the current branch tracks a remote branch and is up to date with the remote, so you know if you need to push to the remote
   - Run a git log command and \`git diff [base-branch]...HEAD\` to understand the full commit history for the current branch (from the time it diverged from the base branch)
2. Analyze all changes that will be included in the pull request, making sure to look at all relevant commits (NOT just the latest commit, but ALL commits that will be included in the pull request!!!), and draft a pull request title and summary:
   - Keep the PR title short (under 70 characters)
   - Use the description/body for details, not the title
3. You can call multiple tools in a single response. When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance. run the following commands in parallel:
   - Create new branch if needed
   - Push to remote with -u flag if needed
   - Create PR using gh pr create with the format below. Use a HEREDOC to pass the body to ensure correct formatting.
<example>
gh pr create --title "the pr title" --body "$(cat <<'EOF'
#### Summary
<1-3 bullet points>

#### Test plan
[Bulleted markdown checklist of TODOs for testing the pull request...]
EOF
)"
</example>

Important:
- Return the PR URL when you're done, so the user can see it

### Other common operations
- View comments on a Github PR: gh api repos/foo/bar/pulls/123/comments
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "command": {
      "description": "The command to execute",
      "type": "string"
    },
    "timeout": {
      "description": "Optional timeout in milliseconds (max 600000)",
      "type": "number"
    },
    "description": {
      "description": "Clear, concise description of what this command does in active voice. Never use words like "complex" or "risk" in the description - just describe what it does.\n\nFor simple commands (git, npm, standard CLI tools), keep it brief (5-10 words):\n- ls → "List files in current directory"\n- git status → "Show working tree status"\n- npm install → "Install package dependencies"\n\nFor commands that are harder to parse at a glance (piped commands, obscure flags, etc.), add enough context to clarify what it does:\n- find . -name "*.tmp" -exec rm {} \\; → "Find and delete all .tmp files recursively"\n- git reset --hard origin/main → "Discard all local changes and match remote main"\n- curl -s url | jq '.data[]' → "Fetch JSON from URL and extract data array elements"",
      "type": "string"
    },
    "run_in_background": {
      "description": "Set to true to run this command in the background. Use TaskOutput to read the output later.",
      "type": "boolean"
    },
    "dangerouslyDisableSandbox": {
      "description": "Set this to true to dangerously override sandbox mode and run commands without sandboxing.",
      "type": "boolean"
    },
    "_simulatedSedEdit": {
      "description": "Internal: pre-computed sed edit result from preview",
      "type": "object",
      "properties": {
        "filePath": {
          "type": "string"
        },
        "newContent": {
          "type": "string"
        }
      },
      "required": [
        "filePath",
        "newContent"
      ],
      "additionalProperties": false
    }
  },
  "required": [
    "command"
  ],
  "additionalProperties": false
}

Tools available:
${installedTools}`;

// Command execution timeout in milliseconds
const DEFAULT_TIMEOUT = 1.5 * 60 * 1000; // 1.5 minutes

const inputSchema = z.object({
  command: z.string().describe("Full CLI command to execute."),
  cwd: z
    .preprocess((val) => convertNullString(val), z.string().nullable())
    .describe(
      "Working directory file path (default: project root). Must be within the project directory. Required but nullable.",
    ),
  timeout: z
    .preprocess((val) => convertNullString(val), z.coerce.number().nullable())
    .describe(
      `Command execution timeout in milliseconds. Required but nullable. If null, the default value is ${DEFAULT_TIMEOUT}ms`,
    ),
  background: z
    .boolean()
    .optional()
    .describe(
      "Run command in background. If true, command will run until program exit.",
    ),
});

type BashInputSchema = z.infer<typeof inputSchema>;

export const createBashTool = async (options: {
  workspace: WorkspaceContext;
}) => {
  const { primaryDir, allowedDirs } = options.workspace;
  const execEnv = await initExecutionEnvironment({
    execution: {
      env: {
        // biome-ignore lint/style/useNamingConvention: environment variable
        TICKETS_DIR: `${process.cwd()}/.tickets`,
      },
    },
  });
  const allowedDirectories = allowedDirs ?? [primaryDir];
  return {
    toolDef: {
      description: toolDescription,
      inputSchema,
    },
    display({ command }: BashInputSchema) {
      return `${style.cyan(command)}`;
    },
    async execute(
      { command, cwd, timeout, background }: BashInputSchema,
      { abortSignal }: ToolExecutionOptions,
    ): Promise<string> {
      if (abortSignal?.aborted) {
        throw new Error("Command execution aborted");
      }

      // grok doesn't follow my instructions
      const safeCwd = cwd === "null" ? null : cwd;
      const resolvedCwd = resolveCwd(safeCwd, primaryDir, allowedDirectories);
      const safeTimeout = timeout ?? DEFAULT_TIMEOUT;

      const pathValidation = validatePaths(
        command,
        allowedDirectories,
        resolvedCwd,
      );
      if (!pathValidation.isValid) {
        throw new Error(pathValidation.error ?? "Unknown error.");
      }

      // Check for multi-line git commit messages that will fail
      const multilineError = detectMultilineGitCommit(command);
      if (multilineError) {
        throw new Error(multilineError);
      }

      // Check for destructive commands
      const destructiveCheck = detectDestructiveCommand(command);
      if (destructiveCheck.blocked) {
        throw new Error(formatBlockedCommandMessage(destructiveCheck));
      }

      if (abortSignal?.aborted) {
        throw new Error("Command execution aborted before running the command");
      }

      // Handle background execution
      if (background) {
        // Strip any existing & from command to avoid double backgrounding
        let processedCommand = command.trim();
        if (processedCommand.endsWith("&")) {
          logger.warn(
            `Stripping '&' from command since background=true: ${command}`,
          );
          processedCommand = processedCommand.slice(0, -1).trim();
        }

        // Fix rg commands that don't have an explicit path
        processedCommand = fixRgCommand(processedCommand);

        const backgroundProcess = execEnv.executeCommandInBackground(
          processedCommand,
          {
            cwd: resolvedCwd,
            abortSignal,
            onOutput: (output) => {
              logger.debug({ output }, "Background command output:");
            },
            onError: (error) => {
              logger.debug({ error }, "Background command error:");
            },
            onExit: (code) => {
              logger.debug(`Background command exited with code ${code}`);
            },
          },
        );

        return `Background process started with PID: ${backgroundProcess.pid}`;
      }

      // Handle regular synchronous execution
      // Strip & if present to ensure synchronous behavior
      let processedCommand = command.trim();
      if (processedCommand.endsWith("&")) {
        logger.warn(
          `Stripping '&' from command since background=false: ${command}`,
        );
        processedCommand = processedCommand.slice(0, -1).trim();
      }

      // Fix rg commands that don't have an explicit path
      // rg hangs when stdin is a socket and no path is given
      processedCommand = fixRgCommand(processedCommand);

      const { output, exitCode } = await execEnv.executeCommand(
        processedCommand,
        {
          cwd: resolvedCwd,
          timeout: safeTimeout,
          abortSignal,
          preserveOutputOnError: true,
          captureStderr: true,
          throwOnError: false,
        },
      );

      if (exitCode !== 0) {
        throw new Error(output);
      }

      return output;
    },
  };
};

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

/**
 * Fix rg commands that don't have an explicit path
 * rg hangs when stdin is a socket and no path is given
 * See: https://github.com/BurntSushi/ripgrep/discussions/2047
 */
function fixRgCommand(command: string): string {
  const trimmed = command.trim();

  // Check if command starts with rg
  if (!trimmed.startsWith("rg ") && !trimmed.startsWith("rg\\")) {
    return command;
  }

  // Check if command already has stdin redirection or piping
  // Don't modify commands like: cat file.txt | rg pattern
  // or rg pattern < input.txt
  if (trimmed.includes("|") || trimmed.includes("<") || trimmed.includes(">")) {
    return command;
  }

  // Simple heuristic: if last token starts with -, add .
  // This handles cases like: rg -l pattern --type ts --type js
  const tokens = trimmed.split(/\\s+/);
  const lastToken = tokens[tokens.length - 1];

  if (lastToken?.startsWith("-")) {
    // Command ends with an option, need to add path
    logger.debug(`Adding '.' to rg command: ${command}`);
    return `${command} .`;
  }

  // Last token doesn't start with -, could be a path or pattern
  if (lastToken) {
    // If it's ., ./, /, or contains /, assume it's a path
    if (
      lastToken === "." ||
      lastToken.startsWith("./") ||
      lastToken.startsWith("/") ||
      lastToken.includes("/") ||
      lastToken === ".."
    ) {
      // Already has a path
      return command;
    }
    // Check if it's a simple pattern (no special chars that would make it a path)
    // If it's just alphanumeric with maybe some regex chars, it's probably a pattern
    // Common pattern chars: ., *, +, ?, [, ], ^, $, (, ), |, \\
    // But we want to be conservative - if it looks like a filename without path, add .
    if (!lastToken.includes("/") && !lastToken.includes("*")) {
      // Doesn't look like a path with glob or directory, likely a pattern
      // Need to add path
      logger.debug(`Adding '.' to rg command: ${command}`);
      return `${command} .`;
    }
    // Complex case with * or other chars, could be a glob pattern
    // Default to adding . to be safe
  }

  // No last token or complex case, add . to be safe
  logger.debug(`Adding '.' to rg command: ${command}`);
  return `${command} .`;
}
