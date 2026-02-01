# Acai: AI-Powered Software Development Assistant

![Project Status](https://img.shields.io/badge/Status-Active-brightgreen)
![License](https://img.shields.io/badge/License-MIT-blue.svg)
<!-- Add more badges as appropriate, e.g., build status, version, etc. -->

## 🚀 Overview

Acai is a powerful **AI-driven command-line interface (CLI) tool** designed to assist software developers in their daily tasks. It acts as an intelligent assistant, capable of understanding natural language prompts, interacting with your codebase, and automating various development workflows.

### Core Functionality:

*   **Interactive AI Assistant:** Engage in a conversational REPL (Read-Eval-Print Loop) or TUI (Terminal User Interface) to get assistance with coding, debugging, refactoring, and more.
*   **Codebase Interaction:** Read, edit, and navigate files; search code; and understand project structure.
*   **Git Integration:** Generate conventional commits, review pull requests, and manage local changes.
*   **Extensible Tooling:** Utilizes a suite of internal tools (e.g., `bash`, `grep`, `WebSearch`) to perform actions.
*   **Multi-Model Support:** Seamlessly switch between various AI providers (e.g., OpenAI, Google, Anthropic, DeepSeek, Groq, OpenRouter).
*   **Context Management:** Automatically incorporates relevant file content, clipboard data, and conversation history into AI prompts.
*   **Piped Input Support:** Pipe text directly to acai via stdin for REPL mode (`echo "prompt" | acai`) or as context with `-p` flag (`echo "context" | acai -p "prompt"). Includes size limits (50KB warning, 200KB max).
*   **Terminal User Interface:** Modern TUI with modal dialogs, autocomplete, and rich text formatting.

## ✨ Features

*   **Conversational REPL/TUI:** Intuitive command-line interface and modern terminal UI for interacting with the AI.
*   **Piped Input Support:** Pipe text directly to acai via stdin. Works in REPL mode (`echo "prompt" | acai`) or as additional context with `-p` flag (`echo "context" | acai -p "prompt"). Includes input size limits with graceful handling.
*   **File System Operations:** Read, write, edit, move, and delete files.
*   **File & Directory Mentions:** Include file contents and entire directories in prompts using `@filename` and `@dirname` syntax.
*   **Code Navigation & Analysis:** Advanced file searching and code analysis capabilities.
*   **Git Workflow Automation:** Streamline commit messages and code reviews.
*   **Extensible Commands:** A rich set of built-in commands (`/help`, `/model`, `/session`, `/list-tools`, etc.).
*   **Token Usage Tracking:** Monitor AI token consumption with comprehensive session overview.
*   **Configurable AI Models:** Easily switch between different LLM providers and models.
*   **Shell Integration:** Execute shell commands inline using `!`command`` syntax or via `/shell` command.
*   **Multi-workspace Support:** Work across multiple project directories simultaneously.
*   **Skills System:** Discover and load specialized instruction files for specific tasks (PDF extraction, database migrations, etc.).


## 🛠️ Technologies Used

Acai is built primarily with **TypeScript** and runs on **Node.js**. Key technologies and dependencies include:

*   **TypeScript:** For type-safe and scalable code.
*   **Node.js:** The JavaScript runtime environment.
*   **AI SDK (`@ai-sdk/*`):** For integrating with various Large Language Models (LLMs) like OpenAI, Google Gemini, Anthropic, DeepSeek, Groq, and OpenRouter.
*   **`ripgrep` (via `grep.ts` tool):** For fast file content searching.
*   **`pino`:** For structured logging.
*   **`zod`:** For schema validation.
*   **`biomejs/biome`:** For code formatting and linting.

## 🚀 Getting Started

### Prerequisites

**Required:**
*   Node.js 20 or higher
*   Git
*   [Ripgrep](https://github.com/BurntSushi/ripgrep) (`rg` command) - Fast file content searching
*   [GitHub CLI](https://cli.github.com/) (`gh` command) - Git operations and repository management

**Installation of system dependencies:**

```bash
# macOS (using Homebrew)
brew install ripgrep gh

# Ubuntu/Debian
sudo apt install ripgrep gh

# Windows (using Chocolatey)
choco install ripgrep gh

# Or using winget
winget install BurntSushi.ripgrep GitHub.cli
```

**Optional but recommended:**
*   API keys for AI providers (see Environment Variables section below)

### Installation for Users

```bash
npm install -g @travisennis/acai
```

### Installation for Developers

```bash
# Clone the repository
git clone https://github.com/travisennis/acai-ts.git # Assuming this is the repo URL
cd acai-ts

# Install dependencies
npm install

# Set up environment variables (see Environment Variables section)
cp .env.example .env  # If .env.example exists, or create .env manually
# Edit .env file with your API keys

# Build the project
npm run build

# Link the CLI tool globally (optional, for easy access)
npm link
```

## Environment Variables

Acai supports various AI providers and web services through environment variables. Create a `.env` file in your project root or set these variables in your shell environment.

### AI Provider API Keys

```bash
# OpenAI (GPT models)
OPENAI_API_KEY=your_openai_api_key_here

# Anthropic (Claude models)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Google (Gemini models)
GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key_here

# DeepSeek
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# Groq (Kimi models)
GROQ_API_KEY=your_groq_api_key_here

# X.AI (Grok models)
X_AI_API_KEY=your_xai_api_key_here
# Alternative name also supported:
# XAI_API_KEY=your_xai_api_key_here

# OpenRouter (Access to multiple models)
OPENROUTER_API_KEY=your_openrouter_api_key_here

# OpenCode Zen
OPENCODE_ZEN_API_TOKEN=your_opencode_zen_api_token_here

# Exa API (for WebSearch tool - web search with DuckDuckGo fallback)
EXA_API_KEY=your_exa_api_key_here
```

### Application Configuration

```bash
# Logging level (optional, defaults to "debug")
# Options: trace, debug, info, warn, error, fatal
LOG_LEVEL=info
```

### Example .env File

```bash
# Core AI providers (at least one recommended)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Optional: Additional providers
GOOGLE_GENERATIVE_AI_API_KEY=...
GROQ_API_KEY=...
OPENROUTER_API_KEY=sk-or-...

# Optional: Application settings
LOG_LEVEL=info
```

**Note:** You need at least one AI provider API key to use Acai. The tool will work with any combination of the supported providers.


### Usage

```bash
# Start interactive mode with default model
acai

# Specify a model
acai --model anthropic:sonnet

# CLI mode (one-shot execution)
acai -p "What files contain the term 'toolCallRepair'?"

# Pipe input for REPL mode (immediately processes, then becomes interactive)
echo "How many TypeScript files are in this project?" | acai

# Pipe input as context with CLI mode
echo "Context information here" | acai -p "Process this context"

# Disable skills discovery
acai --no-skills

# Add additional working directories
acai --add-dir /path/to/project1 --add-dir /path/to/project2

# Resume a previous session by selecting from a list
acai --continue

# Resume the most recent session
acai --resume

# Resume a specific session by ID
acai --resume a1b2c3d4-e5f6-7890-1234-567890abcdef
```

**Note:** When exiting a session with messages, Acai will display a resume command with the session ID:
```
To resume this session call acai --resume <session-id>
```

Once in the REPL, you can type your prompts or use commands:

```
> How do I read a file in Node.js?
> @source/index.ts
> /help
```

### Prompt Mentions & Special Syntax

You can reference files and directories directly in your prompts:

```
> Explain the purpose of @source/index.ts
> What patterns do you see in @source/tools/ directory
> Find security issues in @config/ directory
> Check if `!ls -la` shows any suspicious files
> Analyze @README.md for typos
```

**Supported syntax:**
- `@filename` - Include contents of a specific file
- `@dirname` - Recursively include all files in a directory
- `@http://example.com` - Fetch and include web content
- ``!`command` `` - Execute shell command and include output

### Prompt Arguments

Pass dynamic values to commands using argument placeholders in custom prompts:

#### All arguments with `$ARGUMENTS`

The `$ARGUMENTS` placeholder captures all arguments passed to the command:

```bash
# Command definition
echo 'Fix issue #$ARGUMENTS following our coding standards' > .acai/prompts/fix-issue.md

# Usage
> /fix-issue 123 high-priority
# $ARGUMENTS becomes: "123 high-priority"
```

#### Individual arguments with `$1`, `$2`, `$3`, etc.

Access specific arguments individually using positional parameters (similar to shell scripts):

```bash
# Command definition  
echo 'Review PR #$1 with priority $2 and assign to $3' > .acai/prompts/review-pr.md

# Usage
> /review-pr 456 high alice
# $1 becomes "456", $2 becomes "high", $3 becomes "alice"
```

Use positional arguments when you need to:
- Access arguments individually in different parts of your command
- Provide defaults for missing arguments
- Build more structured commands with specific parameter roles

#### Backward compatibility with `{{INPUT}}`

The legacy `{{INPUT}}` placeholder is still supported and works the same as `$ARGUMENTS`:

```bash
# Command definition
echo 'Analyze the following code: {{INPUT}}' > .acai/prompts/analyze.md

# Usage
> /analyze src/file.ts
# {{INPUT}} becomes: "src/file.ts"
```

**Note:** Using `-p/--prompt` runs in CLI mode (one-shot execution), while running without a prompt starts interactive REPL mode.

### Piped Input

You can pipe text directly to acai via stdin for flexible input scenarios:

```bash
# REPL mode: piped text becomes the initial prompt, processed immediately
echo "What can you do?" | acai
# Acai starts, processes the prompt, displays response,
# then enters interactive mode for continued conversation

# CLI mode: piped text becomes additional context
echo "Codebase overview: 50 files, TypeScript project" | acai -p "Summarize this project"
# Piped content is added as context, -p value is the main prompt
# Runs in single-shot CLI mode and exits

# Multiple inputs
echo "Large context file" | acai -p "Analyze and improve"
```

**Input size limits:**
- **Soft limit (50KB):** Warning logged to stderr, processing continues
- **Hard limit (200KB):** Error displayed, process exits with code 1

**Empty input handling:**
- Empty stdin without `-p` flag: Prints message and exits with code 0
- Empty stdin with `-p` flag: Proceeds normally (no context added)

For a list of available commands, type `/help` within the REPL.

## Interactive CLI Commands

- `/help` - Shows usage information
- `/new` - Saves chat history and resets the conversation
- `/save` - Saves chat history
- `/exit` or `/bye` - Exits and saves chat history
- `/init` - Generate or improve `AGENTS.md`
- `/paste` - Add clipboard contents to the next prompt
- `/prompt <name> [arguments...]` - Load saved prompts with optional arguments. Project prompts override user prompts. Supports argument placeholders (`$ARGUMENTS`, `$1`, `$2`, etc.) in prompt files.
- `/model [provider:model|category|provider]` - List or switch models
- `/session` - Show comprehensive session information including usage and costs
- `/clear` - Clears the terminal screen for the current session
- `/generateRules` - Analyze the current conversation and suggest project rules
- `/copy` - Copy the last assistant response to the system clipboard
- `/list-tools` or `/lt` - List all available tools
- `/add-dir <path>` - Add additional working directory
- `/list-dirs` - List all working directories
- `/remove-dir <path>` - Remove a working directory
- `/health` - Check system health and dependencies
- `/history` - View and manage conversation history
- `/pickup` - Resume a previous conversation
- `/handoff` - Hand off conversation to another agent
- `/share` - Share the current session as a GitHub Gist for viewing in a web browser
- `/shell` - Execute shell commands

**Note**: Some commands mentioned in older documentation may no longer be available. Use `/help` to see current commands.

Clipboard notes:
- macOS: uses `pbcopy`
- Windows: uses `clip`
- Linux: tries `xclip`, falls back to `xsel`

### Keyboard Shortcuts

These shortcuts work in the interactive TUI mode:

| Shortcut | Action |
| :------- | :----- |
| `Ctrl+C` | First press: clears the editor and shows exit confirmation. Second press within 1 second: exits the application. |
| `Ctrl+D` | Exits the application only when the editor is empty. If the editor has content, this shortcut does nothing. |
| `Ctrl+O` | Toggles verbose mode (shows detailed tool execution output). |
| `Escape` | Closes active modal dialogs or interrupts ongoing processing. |

**Note:** These shortcuts use the Kitty keyboard protocol and also work with raw control characters for maximum terminal compatibility.

## Skills System

Acai includes a powerful skills system that allows you to create and use specialized instruction files for specific tasks. Skills are markdown files with YAML frontmatter that provide detailed instructions for particular domains (e.g., database migrations, PDF extraction, code review).

### How Skills Work

1. **Discovery**: At startup, Acai scans multiple locations for skills
2. **Listing**: Available skills are listed in the system prompt
3. **On-demand loading**: When a task matches a skill's description, the agent uses the `read` tool to load the skill file
4. **Execution**: The agent follows the instructions in the skill file

### Skill File Format

Skills are markdown files named `SKILL.md` with YAML frontmatter:

```markdown
---
description: Extract text and tables from PDF files
name: pdf-extract          # Optional, defaults to directory name
---

# PDF Processing Instructions

1. Use `pdftotext` to extract plain text
2. For tables, use `tabula-py` or similar
3. Always verify extraction quality

Scripts are in: ./scripts/
Configuration: ./config.json
```

### Skill Locations

Skills are loaded from these locations (later sources override earlier ones):

1. `~/.codex/skills/**/SKILL.md` (Codex CLI user skills)
2. `~/.claude/skills/*/SKILL.md` (Claude Code user skills)
3. `<cwd>/.claude/skills/*/SKILL.md` (Claude Code project skills)
4. `~/.acai/skills/**/SKILL.md` (Acai user skills)
5. `<cwd>/.acai/skills/**/SKILL.md` (Acai project skills)

### Directory Structure

Skills can be organized hierarchically with colon-separated names:

```
~/.acai/skills/
├── pdf-extract/
│   ├── SKILL.md           # Becomes "pdf-extract" skill
│   └── scripts/           # Optional: supporting files
├── db/
│   └── migrate/
│       └── SKILL.md       # Becomes "db:migrate" skill
└── aws/
    └── s3/
        └── upload/
            └── SKILL.md   # Becomes "aws:s3:upload" skill
```

### Compatibility

Acai's skills system is compatible with:
- **Pi Native Format**: `~/.acai/skills/**/SKILL.md` (recursive, colon-separated paths)
- **Claude Code Format**: `~/.claude/skills/*/SKILL.md` (single level only)
- **Codex CLI Format**: `~/.codex/skills/**/SKILL.md` (recursive, simple names)

### Configuration

Skills are enabled by default. You can disable them via:

1. **CLI flag**: `acai --no-skills`
2. **Settings file**: Add to `~/.acai/acai.json` or `.acai/acai.json`:
   ```json
   {
     "skills": {
       "enabled": false
     }
   }
   ```

### Usage Example

1. **Agent startup**: Scans all skill locations
2. **System prompt**: Lists available skills
3. **User request**: "Extract text from this PDF"
4. **Agent matches**: Sees "pdf-extract: Extract text and tables from PDF files"
5. **Skill loading**: Uses `read` tool to load `~/.acai/skills/pdf-extract/SKILL.md`
6. **Execution**: Follows instructions in skill file (run scripts from this file's directory)

## Configuration

### Project Configuration

Acai supports project-specific configuration through a `.acai/acai.json` file in your project directory:

```json
{
  "logs": {
    "path": "~/.acai/logs/acai.log"  // Optional: Custom log file location
  },
  "notify": true,  // Optional: Enable system notifications (default: false)
  "tools": {
    "maxTokens": 30000  // Optional: Global max token limit for tools
  },
  "skills": {
    "enabled": true  // Optional: Enable/disable skills discovery (default: true)
  },



}
```

### Project-Specific Customization

- **Rules/Guidelines**: Add project-specific AI behavior rules in `AGENTS.md`
- **Custom Prompts**: Store reusable prompts in `.acai/prompts/`. Supports argument placeholders (`$ARGUMENTS`, `$1`, `$2`, etc.) for dynamic content.

- **File Selections**: Save file/directory selections in `.acai/selections/`
- **Memory/Rules**: Persistent project rules stored in `.acai/rules/`

### Global Configuration

Global application settings are stored in:
- **Configuration**: `~/.acai/`
- **Logs**: `~/.acai/logs/acai.log`
- **Sessions**: `~/.acai/sessions/`

### Environment-Specific Setup

For development, you can use different configurations:

```bash
# Development with .env file
npm run dev

# Production
acai

# Custom log level
LOG_LEVEL=warn acai
```

## Web Skills

Acai's web functionality has been moved to standalone skills that operate independently of the core codebase. These skills provide web-related capabilities while keeping the main acai-ts project lightweight and focused.

### Skill Locations

Web skills are located in:
- `~/.acai/skills/web-fetch/` - User-level web fetch skill
- `~/.acai/skills/web-search/` - User-level web search skill
- `<project>/.acai/skills/web-fetch/` - Project-level web fetch skill
- `<project>/.acai/skills/web-search/` - Project-level web search skill


## ⚙️ Development

### Development Environment Setup

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/travisennis/acai-ts.git
   cd acai-ts
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   # Create .env file with your API keys
   touch .env
   # Add your API keys (see Environment Variables section above)
   ```

3. **Development workflow:**
   ```bash
   # Run in development mode (uses .env file)
   npm run dev
   
   # Build and test
   npm run build
   npm test
   
   # Code quality
   npm run lint
   npm run format
   ```

### Available NPM Scripts

Here's a list of useful `npm` scripts for development:

| Script        | Description                                                              |
| :------------ | :----------------------------------------------------------------------- |
| `npm run build` | Compiles the TypeScript source code to JavaScript.                       |
| `npm run clean` | Removes the `dist/` directory.                                           |
| `npm run compile` | Compiles TypeScript files (`tsc --pretty`).                              |
| `npm run lint`  | Runs Biome linter to check for code style and quality issues.            |
| `npm run lint:fix` | Automatically fixes linting issues using Biome.                          |
| `npm run test`  | Runs unit tests with code coverage using `c8`.                           |
| `npm run format` | Formats the codebase using Biome.                                        |
| `npm run dev`   | Starts the application in development mode (loads .env file automatically). |
| `npm run oxlint` | Runs Oxlint for additional code quality checks.                          |
| `npm run knip`  | Detects unused files, dependencies, and exports.                         |
| `npm run check` | Interactively checks for and updates outdated npm packages.              |
| `npm run cpd`   | Checks for copy-pasted code using `jscpd`.                               |
| `npm run typecheck` | Type checks the codebase without emitting files.                        |

### Code Structure

The project is organized as follows:

```
.
├── .acai/             # Internal configuration and temporary files
├── source/            # Main application source code
│   ├── agent/         # Agent loop and manual execution
│   ├── api/           # External API integrations (e.g., Exa)
│   ├── cli.ts         # CLI entry point
│   ├── commands/      # Implementations of REPL commands
│   ├── execution/     # Command execution utilities
│   ├── middleware/    # AI request/response middleware (logging, rate limiting)
│   ├── models/        # AI model providers and management
│   ├── prompts/       # Prompt generation and management
│   ├── repl/          # REPL interface components
│   ├── terminal/      # Terminal output formatting and rendering
│   ├── tui/           # Terminal User Interface components
│   ├── tools/         # AI-callable tools (filesystem, git, web, bash, etc.)
│   ├── tokens/        # Token counting and tracking
│   └── utils/         # Utility functions
├── test/              # Unit tests
├── ARCHITECTURE.md    # Detailed architectural overview and flow diagrams
├── AGENTS.md          # Project-specific AI rules and guidelines
├── TODO.md            # Project roadmap and planned features
├── package.json       # Project metadata, dependencies, and scripts
└── README.md          # This file
```

For a more in-depth understanding of the project's architecture and internal flows, please refer to the [ARCHITECTURE.md](ARCHITECTURE.md) document.

## 📚 Documentation & Examples

*   **[ARCHITECTURE.md](ARCHITECTURE.md):** Provides a comprehensive overview of the project's architecture, including file descriptions and Mermaid flow diagrams.
*   **[AGENTS.md](AGENTS.md):** Contains specific rules and guidelines for the AI agent's behavior within this project.
*   **In-app `/help` command:** Use `/help` within the Acai REPL for a list of available commands and their usage.
*   **`source/commands/` directory:** Review the TypeScript files in this directory to understand how each REPL command is implemented.
*   **`source/tools/` directory:** Explore the available tools that the AI can leverage.

## 🤝 Contributing

We welcome contributions! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) (if it exists, otherwise remove this line) for guidelines on how to contribute.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Contact

For questions or feedback, please open an issue on the GitHub repository.
```
