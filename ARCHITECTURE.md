# Acai Architecture

This document outlines the architecture of the Acai CLI tool, a powerful AI-driven software development assistant. It details the project structure, provides descriptions for each file, and illustrates the primary application flows with Mermaid diagrams.

## Project Structure

```
├── acai-ts
│   ├── .acai
│   │   ├── acai.json
│   │   ├── memory
│   │   ├── prompts
│   │   │   ├── project-status.md
│   │   │   └── update-architecture-document.md
│   │   ├── rules
│   │   │   └── learned-rules.md
│   ├── .gitignore
│   ├── .husky
│   │   ├── _
│   │   │   ├── .gitignore
│   │   │   ├── applypatch-msg
│   │   │   ├── commit-msg
│   │   │   ├── h
│   │   │   ├── husky.sh
│   │   │   ├── post-applypatch
│   │   │   ├── post-checkout
│   │   │   ├── post-commit
│   │   │   ├── post-merge
│   │   │   ├── post-rewrite
│   │   │   ├── pre-applypatch
│   │   │   ├── pre-auto-gc
│   │   │   ├── pre-commit
│   │   │   ├── pre-merge-commit
│   │   │   ├── pre-push
│   │   │   ├── pre-rebase
│   │   │   └── prepare-commit-msg
│   │   ├── commit-msg
│   │   └── pre-commit
│   ├── .ignore
│   ├── AGENTS.md
│   ├── ARCHITECTURE.md
│   ├── LICENSE
│   ├── README.md
│   ├── TODO.md
│   ├── biome.json
│   ├── commitlint.config.js
│   ├── docs
│   ├── knip.json
│   ├── package-lock.json
│   ├── package.json
│   ├── source
│   │   ├── cli.ts
│   │   ├── commands
│   │   │   ├── application-log-command.ts
│   │   │   ├── clear-command.ts
│   │   │   ├── compact-command.ts
│   │   │   ├── edit-command.ts
│   │   │   ├── edit-prompt-command.ts
│   │   │   ├── exit-command.ts
│   │   │   ├── files-command.ts
│   │   │   ├── generate-rules-command.ts
│   │   │   ├── help-command.ts
│   │   │   ├── init-command.ts
│   │   │   ├── last-log-command.ts
│   │   │   ├── manager.ts
│   │   │   ├── model-command.ts
│   │   │   ├── paste-command.ts
│   │   │   ├── prompt-command.ts
│   │   │   ├── reset-command.ts
│   │   │   ├── rules-command.ts
│   │   │   ├── save-command.ts
│   │   │   ├── types.ts
│   │   │   ├── usage-command.ts
│   │   ├── config.ts
│   │   ├── conversation-analyzer.ts
│   │   ├── dedent.ts
│   │   ├── formatting.ts
│   │   ├── index.ts
│   │   ├── logger.ts
│   │   ├── mentions.ts
│   │   ├── messages.ts
│   │   ├── middleware
│   │   │   ├── audit-message.ts
│   │   │   ├── index.ts
│   │   │   ├── rate-limit.ts
│   │   ├── models
│   │   │   ├── ai-config.ts
│   │   │   ├── anthropic-provider.ts
│   │   │   ├── deepseek-provider.ts
│   │   │   ├── google-provider.ts
│   │   │   ├── manager.ts
│   │   │   ├── openai-provider.ts
│   │   │   ├── openrouter-provider.ts
│   │   │   ├── providers.ts
│   │   │   └── xai-provider.ts
│   │   ├── parsing.ts
│   │   ├── prompts
│   │   │   └── manager.ts
│   │   ├── prompts.ts
│   │   ├── repl-prompt.ts
│   │   ├── repl.ts
│   │   ├── saved-selections
│   │   ├── terminal
│   │   │   ├── formatting.ts
│   │   │   ├── index.ts
│   │   │   ├── markdown-utils.ts
│   │   │   ├── markdown.ts
│   │   │   └── types.ts
│   │   ├── token-tracker.ts
│   │   ├── token-utils.ts
│   │   ├── tools
│   │   │   ├── agent.ts
│   │   │   ├── bash.ts
│   │   │   ├── code-interpreter.ts
│   │   │   ├── command-validation.ts
│   │   │   ├── delete-file.ts
│   │   │   ├── directory-tree.ts
│   │   │   ├── edit-file.ts
│   │   │   ├── filesystem-utils.ts
│   │   │   ├── git-utils.ts
│   │   │   ├── grep.ts
│   │   │   ├── index.ts
│   │   │   ├── memory-read.ts
│   │   │   ├── memory-write.ts
│   │   │   ├── move-file.ts
│   │   │   ├── read-file.ts
│   │   │   ├── read-multiple-files.ts
│   │   │   ├── save-file.ts
│   │   │   ├── think.ts
│   │   │   ├── types.ts
│   │   │   ├── web-fetch.ts
│   │   │   ├── web-search.ts
│   │   ├── utils
│   │   │   └── process.ts
│   ├── test
│   │   ├── commands
│   │   ├── terminal
│   │   │   └── markdown-utils.test.ts
│   │   ├── tools
│   │   │   └── command-validation.test.ts
│   ├── tsconfig.json
```

## File Descriptions

| File Path | Description |
| :--- | :--- |
| **.acai** | This directory serves as the central location for Acai's internal state, configuration, and temporary files. |
| **acai.json** | This file contains project-specific configuration for the Acai CLI tool, including custom commands and tool settings. |
| **learned-rules.md** | This file stores rules learned by Acai based on user corrections and feedback, aiming to improve its future behavior. |
| **.gitignore** | This file specifies intentionally untracked files and directories that Git should ignore during version control. |
| **.husky** | Directory for Husky Git hooks configuration |
| **.ignore** | This file is used by file watching or search tools (like ripgrep) to specify files and directories to ignore beyond `.gitignore`. |
| **AGENTS.md** | This markdown file contains project-specific rules, guidelines, and commands for Acai to follow. |
| **ARCHITECTURE.md** | This document outlines the overall architecture and project structure of the Acai CLI tool. |
| **README.md** | This file provides a comprehensive overview of the Acai project, including its features, installation instructions, usage examples, and configuration details. |
| **TODO.md** | This markdown file lists tasks or features that are planned for future implementation within the project. |
| **biome.json** | This file is the configuration for the Biome tool, defining code formatting and linting rules for the project. |
| **commitlint.config.js** | Configuration file for commitlint to enforce Conventional Commits |
| **knip.json** | This file is the configuration for Knip, a tool used to detect unused files, dependencies, and exports in the project. |
| **package-lock.json** | This file records the exact versions of all installed Node.js dependencies, ensuring reproducible builds across different environments. |
| **package.json** | This file defines project metadata (name, version), dependencies, development scripts, and binary entry points for the Node.js project. |
| **source/cli.ts** | Command-line interface entry point and argument parsing |
| **source/commands/** | Directory containing all REPL command implementations |
| **application-log-command.ts** | Command for viewing application logs |
| **clear-command.ts** | Implements the `/clear` REPL command to clear the terminal screen |
| **compact-command.ts** | Implements the `/compact` REPL command to save, summarize, and reset chat history |
| **edit-command.ts** | Command for editing files directly within the REPL |
| **edit-prompt-command.ts** | Command to modify the current prompt before sending to AI |
| **exit-command.ts** | Implements the `/exit` command to exit the application |
| **files-command.ts** | Command to interactively select files and add their content to the prompt |
| **generate-rules-command.ts** | Command to generate new rules based on conversation analysis |
| **help-command.ts** | Implements the `/help` command to display usage information |
| **init-command.ts** | Command to initialize or improve the AGENTS.md file |
| **last-log-command.ts** | Command to view the most recent application log entries |
| **manager.ts** | Defines the CommandManager class that registers and routes commands |
| **model-command.ts** | Command to list available AI models or switch between them |
| **paste-command.ts** | Implements the `/paste` command to add clipboard contents to the next prompt |
| **prompt-command.ts** | Command to load previously saved prompts |
| **reset-command.ts** | Implements the `/reset` command to save and reset chat history |
| **rules-command.ts** | Command to view/edit persistent project rules and memories |
| **save-command.ts** | Implements the `/save` command to save current chat history |
| **types.ts** | Common TypeScript types and interfaces for commands |
| **usage-command.ts** | Command to display token usage breakdown |
| **source/config.ts** | Manages configuration files from project and user directories |
| **source/conversation-analyzer.ts** | Analyzes conversation history to identify user corrections and infer new rules |
| **source/dedent.ts** | Utility for removing common indentation from multi-line strings |
| **source/formatting.ts** | Utilities for formatting content consistently in prompts/output |
| **source/index.ts** | Main entry point for the acai CLI application |
| **source/logger.ts** | Configures application-wide logging with pino and file transport |
| **source/mentions.ts** | Handles @mentions in prompts to auto-fetch file/URL content |
| **source/messages.ts** | Manages conversation log, saving/loading history, and summarization |
| **source/middleware/** | Directory for middleware components |
| **audit-message.ts** | Middleware to log AI requests/responses for debugging |
| **index.ts** | Barrel file exporting middleware components |
| **rate-limit.ts** | Middleware to enforce rate limits on AI API calls |
| **source/models/** | Directory for AI model management |
| **ai-config.ts** | Determines dynamic AI parameters based on model capabilities |
| **anthropic-provider.ts** | Configuration for Anthropic AI provider |
| **deepseek-provider.ts** | Configuration for DeepSeek AI provider |
| **google-provider.ts** | Configuration for Google AI provider |
| **manager.ts** | ModelManager class for managing AI model registry |
| **openai-provider.ts** | Configuration for OpenAI provider |
| **openrouter-provider.ts** | Configuration for OpenRouter AI provider |
| **providers.ts** | Central registry of supported AI models and helpers |
| **xai-provider.ts** | Configuration for XAI provider |
| **source/parsing.ts** | Utilities for data parsing, especially JSON with Zod |
| **source/prompts/** | Directory for prompt management |
| **manager.ts** | PromptManager class for managing prompt state |
| **source/prompts.ts** | Dynamically generates the main system prompt for AI models |
| **source/repl-prompt.ts** | Implements user input prompt with history and tab completion |
| **source/repl.ts** | Repl class that orchestrates the main application loop |
| **source/saved-selections** | Directory for storing saved file selections |
| **source/terminal/** | Terminal output and formatting utilities |
| **formatting.ts** | Low-level terminal manipulation functions |
| **index.ts** | Main Terminal class for formatted console output |
| **markdown-utils.ts** | Utilities for processing Markdown content |
| **markdown.ts** | Core logic for Markdown processing |
| **types.ts** | Type definitions for terminal module |
| **source/token-tracker.ts** | Tracks and aggregates token usage across AI calls |
| **source/token-utils.ts** | Utilities for accurate token counting using tiktoken |
| **source/tools/** | Directory containing all tool implementations |
| **agent.ts** | Core AI agent logic |
| **bash.ts** | Executes whitelisted shell commands securely |
| **code-interpreter.ts** | Executes sandboxed JavaScript code |
| **command-validation.ts** | Validates CLI commands |
| **delete-file.ts** | Removes files from the file system |
| **directory-tree.ts** | Gets directory tree structure |
| **edit-file.ts** | Modifies file contents with path validation |
| **filesystem-utils.ts** | General utilities for file system operations |
| **git-utils.ts** | Utilities for Git operations |
| **grep.ts** | Searches file contents using ripgrep |
| **index.ts** | Initializes and exports all tools |
| **memory-read.ts** | Reads from agent's memory |
| **memory-write.ts** | Writes to agent's memory |
| **move-file.ts** | Moves or renames files |
| **read-file.ts** | Reads file contents |
| **read-multiple-files.ts** | Reads multiple files efficiently |
| **save-file.ts** | Writes content to files |
| **think.ts** | Tool to log AI thought process |
| **types.ts** | Common types for tool communication |
| **web-fetch.ts** | Retrieves content from URLs |
| **web-search.ts** | Performs web searches using Exa API |
| **source/utils/process.ts** | Robust promise-based wrapper for child_process.execFile |
| **test/commands/** | Tests for command implementations |
| **test/terminal/markdown-utils.test.ts** | Tests for markdown utilities |
| **test/tools/command-validation.test.ts** | Tests for command validation |
| **tsconfig.json** | TypeScript compiler configuration |

## Flow Diagram

The primary entry point for the Acai CLI is `source/index.ts`, which is compiled to `dist/index.js` and executed via the `acai` binary defined in `package.json`. The application initializes and enters a REPL (Read-Eval-Print Loop) to handle user input.

### Application Initialization and REPL

```mermaid
graph TD
    A[Start acai] --> B{source/index.ts};
    B --> C[Initialize ConfigManager];
    C --> D[Initialize Logger];
    D --> E[Initialize ModelManager];
    E --> F[Initialize MessageHistory];
    F --> G[Initialize CommandManager];
    G --> H[Initialize REPL];
    H --> I{Wait for user input};
    I --> J{Input starts with "/"?};
    J -- Yes --> K[Execute Command];
    J -- No --> L[Process as AI Prompt];
    K --> I;
    L --> I;
```

### AI Prompt Processing

```mermaid
graph TD
    A[User enters prompt] --> B{Process Mentions};
    B --> C[Build System Prompt];
    C --> D{Select AI Model};
    D --> E[Send to AI Provider];
    E --> F{Receive AI Response};
    F --> G{Response contains tool calls?};
    G -- Yes --> H[Execute Tools];
    H --> E;
    G -- No --> I[Display response to user];
    I --> A;
```

### Command Execution (`/` commands)

```mermaid
graph TD
    A[User enters command] --> B{CommandManager};
    B --> C{Find matching command handler};
    C -- Found --> D[Execute command handler];
    D --> E[Display output to user];
    E --> A;
    C -- Not Found --> F[Display error message];
    F --> A;
```
