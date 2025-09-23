# Acai Architecture

This document outlines the architecture of the Acai CLI tool, an AI-powered command-line assistant for software development. It contains the project structure (excluding dot directories), a comprehensive list of file descriptions, and primary flow diagrams using Mermaid. Updates reflect the current project state as of the latest directory scan.

## Project Structure

\`\`\`
acai-ts
├── AGENTS.md
├── ARCHITECTURE.md
├── LICENSE
├── README.md
├── TODO.md
├── .gitignore
├── .ignore
├── .npmignore
├── biome.json
├── commitlint.config.js
├── knip.json
├── package-lock.json
├── package.json
├── tsconfig.build.json
├── tsconfig.json
├── source
│   ├── api
│   │   └── exa
│   │       └── index.ts
│   ├── cli.ts
│   ├── commands
│   │   ├── application-log-command.ts
│   │   ├── clear-command.ts
│   │   ├── compact-command.ts
│   │   ├── copy-command.ts
│   │   ├── edit-command.ts
│   │   ├── edit-prompt-command.ts
│   │   ├── exit-command.ts
│   │   ├── files-command.ts
│   │   ├── generate-rules-command.ts
│   │   ├── health-command.ts
│   │   ├── help-command.ts
│   │   ├── init-command.ts
│   │   ├── last-log-command.ts
│   │   ├── list-tools-command.ts
│   │   ├── manager.ts
│   │   ├── model-command.ts
│   │   ├── paste-command.ts
│   │   ├── prompt-command.ts
│   │   ├── reset-command.ts
│   │   ├── rules-command.ts
│   │   ├── save-command.ts
│   │   ├── types.ts
│   │   └── usage-command.ts
│   ├── config.ts
│   ├── conversation-analyzer.ts
│   ├── dedent.ts
│   ├── execution
│   │   └── index.ts
│   ├── formatting.ts
│   ├── index.ts
│   ├── logger.ts
│   ├── mentions.ts
│   ├── messages.ts
│   ├── middleware
│   │   ├── audit-message.ts
│   │   ├── index.ts
│   │   └── rate-limit.ts
│   ├── models
│   │   ├── ai-config.ts
│   │   ├── anthropic-provider.ts
│   │   ├── deepseek-provider.ts
│   │   ├── google-provider.ts
│   │   ├── groq-provider.ts
│   │   ├── manager.ts
│   │   ├── openai-provider.ts
│   │   ├── openrouter-provider.ts
│   │   ├── providers.ts
│   │   └── xai-provider.ts
│   ├── parsing.ts
│   ├── prompts
│   │   └── manager.ts
│   ├── prompts.ts
│   ├── repl
│   │   ├── display-tool-messages.ts
│   │   ├── display-tool-use.ts
│   │   ├── get-prompt-header.ts
│   │   └── tool-call-repair.ts
│   ├── repl-prompt.ts
│   ├── repl.ts
│   ├── saved-selections
│   ├── terminal
│   │   ├── ansi-styles.ts
│   │   ├── chalk.ts
│   │   ├── default-theme.ts
│   │   ├── formatting.ts
│   │   ├── highlight
│   │   │   ├── index.ts
│   │   │   └── theme.ts
│   │   ├── index.ts
│   │   ├── markdown-utils.ts
│   │   ├── markdown.ts
│   │   ├── supports-color.ts
│   │   ├── supports-hyperlinks.ts
│   │   └── types.ts
│   ├── terminal-output.test.ts
│   ├── token-tracker.ts
│   ├── token-utils.ts
│   ├── tool-executor.ts
│   ├── tools
│   │   ├── agent.ts
│   │   ├── bash-utils.ts
│   │   ├── bash.ts
│   │   ├── code-interpreter.ts
│   │   ├── delete-file.ts
│   │   ├── directory-tree.ts
│   │   ├── dynamic-tool-loader.ts
│   │   ├── dynamic-tool-parser.ts
│   │   ├── edit-file.ts
│   │   ├── filesystem-utils.ts
│   │   ├── git-utils.ts
│   │   ├── grep.ts
│   │   ├── index.ts
│   │   ├── move-file.ts
│   │   ├── read-file.ts
│   │   ├── read-multiple-files.ts
│   │   ├── save-file.ts
│   │   ├── think.ts
│   │   ├── types.ts
│   │   ├── web-fetch.ts
│   │   └── web-search.ts
│   ├── utils
│   │   ├── process.ts
│   │   └── zod-utils.ts
│   └── version.ts
├── test
│   ├── commands
│   │   ├── copy-command.test.ts
│   │   └── health-command.test.ts
│   ├── config.test.ts
│   ├── execution.test.ts
│   ├── mentions.test.ts
│   ├── terminal
│   │   ├── highlight.test.ts
│   │   └── markdown-utils.test.ts
│   ├── tools
│   │   ├── bash-utils.test.ts
│   │   ├── bash.test.ts
│   │   ├── code-interpreter.test.ts
│   │   ├── dynamic-tool-integration.test.ts
│   │   ├── dynamic-tool-parser.test.ts
│   │   ├── filesystem-utils.test.ts
│   │   └── grep.test.ts
│   └── utils
│       └── process.test.ts
\`\`\`

Notes:
- Dot directories (e.g., .acai, .github, .husky) are omitted.
- Empty directories like saved-selections are included but have no files.

## File Descriptions

Files are grouped by directory. Descriptions are brief overviews of purpose and responsibilities based on code structure and naming conventions.

### Top-level Files
- **AGENTS.md**: Documentation of agent behaviors, rules, and prompts used by the AI.
- **ARCHITECTURE.md**: This document, detailing project structure, files, and flows.
- **LICENSE**: MIT license for the project.
- **README.md**: Introduction, installation, and usage instructions.
- **TODO.md**: List of planned features and tasks.
- **.gitignore**: Patterns for files to ignore in Git.
- **.ignore**: Additional ignore patterns, possibly for linting or tools.
- **.npmignore**: Files excluded from the NPM package.
- **biome.json**: Configuration for Biome (linting and formatting tool).
- **commitlint.config.js**: Configuration for commit message validation.
- **knip.json**: Configuration for Knip (unused code detector).
- **package-lock.json**: Locked dependencies for reproducible installs.
- **package.json**: Project metadata, dependencies, scripts, and binary entry points (acai -> dist/index.js).
- **tsconfig.build.json**: TypeScript configuration for production build.
- **tsconfig.json**: TypeScript configuration for development and type-checking.

### source/ Directory
- **api/exa/index.ts**: Integration for Exa API, likely for advanced search or data retrieval tools.
- **cli.ts**: Parses command-line arguments and flags for the application.
- **commands/application-log-command.ts**: Command to view or manage application logs.
- **commands/clear-command.ts**: Command to clear the conversation history or screen.
- **commands/compact-command.ts**: Command to compact or summarize conversation history.
- **commands/copy-command.ts**: Command to copy output or selections to clipboard.
- **commands/edit-command.ts**: Command to edit files or prompts using AI.
- **commands/edit-prompt-command.ts**: Command to edit saved prompts.
- **commands/exit-command.ts**: Command to exit the REPL.
- **commands/files-command.ts**: Command to list or manage project files.
- **commands/generate-rules-command.ts**: Command to generate or update agent rules.
- **commands/health-command.ts**: Command to check application health and status.
- **commands/help-command.ts**: Command to display help information.
- **commands/init-command.ts**: Command to initialize the project or configuration.
- **commands/last-log-command.ts**: Command to show the last log entry.
- **commands/list-tools-command.ts**: Command to list available tools.
- **commands/manager.ts**: Manages registration and execution of all commands.
- **commands/model-command.ts**: Command to switch or configure AI models.
- **commands/paste-command.ts**: Command to paste input from clipboard.
- **commands/prompt-command.ts**: Command to manage or execute saved prompts.
- **commands/reset-command.ts**: Command to reset conversation or state.
- **commands/rules-command.ts**: Command to view or edit rules.
- **commands/save-command.ts**: Command to save conversation or outputs.
- **commands/types.ts**: Type definitions for commands.
- **commands/usage-command.ts**: Command to show usage statistics or token usage.
- **config.ts**: Loads and validates configuration from env, files, and defaults.
- **conversation-analyzer.ts**: Analyzes conversation history for patterns or summaries.
- **dedent.ts**: Utility function to remove indentation from multi-line strings.
- **execution/index.ts**: Handles execution of code or commands, possibly wrapping tools.
- **formatting.ts**: Utilities for formatting text, code, or output.
- **index.ts**: Main entry point; bootstraps app, initializes subsystems, and starts REPL.
- **logger.ts**: Configures and provides logging throughout the application.
- **mentions.ts**: Detects and handles @mentions in prompts or messages.
- **messages.ts**: Manages message history, persistence, and serialization.
- **middleware/audit-message.ts**: Middleware to audit and log messages for compliance.
- **middleware/index.ts**: Exports middleware chain for request/response processing.
- **middleware/rate-limit.ts**: Middleware to enforce rate limiting on API calls.
- **models/ai-config.ts**: Configuration and capability detection for AI models.
- **models/anthropic-provider.ts**: Adapter for Anthropic AI provider.
- **models/deepseek-provider.ts**: Adapter for DeepSeek AI provider.
- **models/google-provider.ts**: Adapter for Google AI provider.
- **models/groq-provider.ts**: Adapter for Groq AI provider.
- **models/manager.ts**: Manages selection and invocation of AI providers and models.
- **models/openai-provider.ts**: Adapter for OpenAI provider.
- **models/openrouter-provider.ts**: Adapter for OpenRouter provider.
- **models/providers.ts**: Base types and utilities for all providers.
- **models/xai-provider.ts**: Adapter for xAI provider.
- **parsing.ts**: Utilities for parsing user input, responses, or data.
- **prompts/manager.ts**: Manages loading and saving of prompt templates.
- **prompts.ts**: Builds system and user prompts for AI interactions.
- **repl/display-tool-messages.ts**: Displays messages related to tool executions in REPL.
- **repl/display-tool-use.ts**: Handles display of tool usage in the REPL.
- **repl/get-prompt-header.ts**: Generates headers for REPL prompts.
- **repl/tool-call-repair.ts**: Repairs or handles errors in tool calls.
- **repl-prompt.ts**: Configures the interactive prompt for the REPL.
- **repl.ts**: Implements the Read-Eval-Print Loop for interactive sessions.
- **saved-selections/**: Directory for storing user-saved file selections (empty currently).
- **terminal/ansi-styles.ts**: ANSI color and style utilities for terminal output.
- **terminal/chalk.ts**: Color logging utility for terminal.
- **terminal/default-theme.ts**: Default color theme for terminal output.
- **terminal/formatting.ts**: Formatting functions for terminal display.
- **terminal/highlight/index.ts**: Syntax highlighting implementation.
- **terminal/highlight/theme.ts**: Themes for syntax highlighting.
- **terminal/index.ts**: Main terminal utilities module.
- **terminal/markdown-utils.ts**: Utilities for rendering Markdown in terminal.
- **terminal/markdown.ts**: Markdown parser and renderer for terminal.
- **terminal/supports-color.ts**: Detects terminal color support.
- **terminal/supports-hyperlinks.ts**: Detects hyperlink support in terminal.
- **terminal/types.ts**: Type definitions for terminal components.
- **terminal-output.test.ts**: Unit tests for terminal output rendering.
- **token-tracker.ts**: Tracks and manages token usage for prompts and responses.
- **token-utils.ts**: Utilities for token counting using tiktoken.
- **tool-executor.ts**: Executes AI tools based on model requests.
- **tools/agent.ts**: AI agent logic for coordinating tool usage.
- **tools/bash-utils.ts**: Utilities for bash command execution.
- **tools/bash.ts**: Tool for executing shell commands safely.
- **tools/code-interpreter.ts**: Tool for running JavaScript code in a sandbox.
- **tools/delete-file.ts**: Tool to delete files with validation.
- **tools/directory-tree.ts**: Tool to generate project directory tree.
- **tools/dynamic-tool-loader.ts**: Dynamically loads tool definitions.
- **tools/dynamic-tool-parser.ts**: Parses dynamic tool specifications.
- **tools/edit-file.ts**: Tool to edit files with diff support.
- **tools/filesystem-utils.ts**: General filesystem utilities for tools.
- **tools/git-utils.ts**: Utilities for Git operations.
- **tools/grep.ts**: Tool for searching files using ripgrep.
- **tools/index.ts**: Registry and exports for all tools.
- **tools/move-file.ts**: Tool to move or rename files.
- **tools/read-file.ts**: Tool to read file contents.
- **tools/read-multiple-files.ts**: Tool to read multiple files at once.
- **tools/save-file.ts**: Tool to save or create files.
- **tools/think.ts**: Tool for agent to log thoughts without side effects.
- **tools/types.ts**: Type definitions for tools.
- **tools/web-fetch.ts**: Tool to fetch web content.
- **tools/web-search.ts**: Tool for web searching.
- **utils/process.ts**: Utilities for spawning and managing processes.
- **utils/zod-utils.ts**: Zod schema utilities for validation.
- **version.ts**: Manages and exposes application version.

### test/ Directory
- **commands/copy-command.test.ts**: Unit tests for copy command.
- **commands/health-command.test.ts**: Unit tests for health command.
- **config.test.ts**: Unit tests for configuration loading.
- **execution.test.ts**: Unit tests for execution module.
- **mentions.test.ts**: Unit tests for mention detection.
- **terminal/highlight.test.ts**: Unit tests for syntax highlighting.
- **terminal/markdown-utils.test.ts**: Unit tests for Markdown utilities.
- **tools/bash-utils.test.ts**: Unit tests for bash utilities.
- **tools/bash.test.ts**: Unit tests for bash tool.
- **tools/code-interpreter.test.ts**: Unit tests for code interpreter tool.
- **tools/dynamic-tool-integration.test.ts**: Integration tests for dynamic tools.
- **tools/dynamic-tool-parser.test.ts**: Unit tests for dynamic tool parser.
- **tools/filesystem-utils.test.ts**: Unit tests for filesystem utilities.
- **tools/grep.test.ts**: Unit tests for grep tool.
- **utils/process.test.ts**: Unit tests for process utilities.

## Flow Diagram

Entry points from package.json:
- Binary: \`acai\` -> \`dist/index.js\` (built from source/index.ts)
- Development: \`npm run dev\` -> \`node ./source/index.ts\`

### Application Startup and REPL

\`\`\`mermaid
graph TD
  A[User runs acai binary or dev script] --> B[Execute source/index.ts]
  B --> C[Load configuration source/config.ts]
  C --> D[Initialize logger source/logger.ts]
  D --> E[Initialize models source/models/manager.ts]
  E --> F[Initialize prompts and messages]
  F --> G[Setup commands source/commands/manager.ts]
  G --> H[Start REPL source/repl.ts]
  H --> I[Interactive loop: input -> process -> output]
\`\`\`

### User Input Handling (Command vs AI Prompt)

\`\`\`mermaid
graph TD
  A[User input in REPL] --> B{Starts with / ?}
  B -->|Yes| C[Execute command via manager]
  C --> D[Display command result]
  B -->|No| E[Build prompt source/prompts.ts]
  E --> F[Send to model manager]
  F --> G[Provider adapter e.g. openai-provider.ts]
  G --> H[AI response]
  H --> I{Includes tool calls?}
  I -->|Yes| J[Execute tools via agent.ts]
  J --> K[Feed results back to AI]
  K --> L[Final response]
  I -->|No| L
  L --> M[Display in terminal]
  M --> N[Update history source/messages.ts]
\`\`\`

### Tool Execution Flow

\`\`\`mermaid
sequenceDiagram
  participant U as User
  participant R as REPL
  participant M as Model Manager
  participant A as Agent (tools/agent.ts)
  participant T as Tool (e.g. bash.ts)
  participant P as Provider (e.g. openai-provider.ts)

  U->>R: Submit prompt
  R->>M: Construct request
  M->>P: Send to provider
  P->>AI: AI processes
  Note over AI: AI decides to call tool
  AI-->>P: Response with tool_call
  P-->>M: Deliver tool call
  M-->>R: Forward to agent
  R->>A: Validate and execute tool
  A->>T: Invoke tool implementation
  T-->>A: Return result
  A-->>R: Append tool result to messages
  R->>M: Request continuation
  M->>P: Send updated request
  P->>AI: AI continues
  AI-->>P: Final response
  P-->>M: Deliver
  M-->>R: Display to user
\`\`\`

### Dynamic Tool Loading (New)

\`\`\`mermaid
graph TD
  A[Model requests unknown tool] --> B[Agent checks registry source/tools/index.ts]
  B --> C{Dynamic?}
  C -->|Yes| D[Load via dynamic-tool-loader.ts]
  D --> E[Parse spec with dynamic-tool-parser.ts]
  E --> F[Register temp tool]
  F --> G[Execute as normal]
  C -->|No| H[Error: Unknown tool]
\`\`\`

These diagrams cover the primary flows: startup, input processing, tool invocation, and dynamic tool support.