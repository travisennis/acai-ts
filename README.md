# Acai: AI-Powered Software Development Assistant

![Project Status](https://img.shields.io/badge/Status-Active-brightgreen)
![License](https://img.shields.io/badge/License-MIT-blue.svg)
<!-- Add more badges as appropriate, e.g., build status, version, etc. -->

## 🚀 Overview

Acai is a powerful **AI-driven command-line interface (CLI) tool** designed to assist software developers in their daily tasks. It acts as an intelligent assistant, capable of understanding natural language prompts, interacting with your codebase, and automating various development workflows.

### Core Functionality:

*   **Interactive AI Assistant:** Engage in a conversational REPL (Read-Eval-Print Loop) to get assistance with coding, debugging, refactoring, and more.
*   **Codebase Interaction:** Read, edit, and navigate files; search code; and understand project structure.
*   **Git Integration:** Generate conventional commits, review pull requests, and manage local changes.
*   **Extensible Tooling:** Utilizes a suite of internal tools (e.g., `bash`, `codeInterpreter`, `webSearch`) to perform actions.
*   **Multi-Model Support:** Seamlessly switch between various AI providers (e.g., OpenAI, Google, Anthropic, DeepSeek, OpenRouter).
*   **Context Management:** Automatically incorporates relevant file content, clipboard data, and conversation history into AI prompts.
*   **Configurable & Learnable:** Customize behavior through project-specific rules and learn from user corrections.

## ✨ Features

*   **Conversational REPL:** Intuitive command-line interface for interacting with the AI.
*   **File System Operations:** Read, write, edit, move, and delete files.
*   **File & Directory Mentions:** Include file contents and entire directories in prompts using `@filename` and `@dirname` syntax.
*   **Code Navigation & Analysis:** Leverage Tree-sitter for intelligent code understanding.
*   **Git Workflow Automation:** Streamline commit messages and code reviews.
*   **Web Integration:** Perform web searches and fetch content from URLs.
*   **Extensible Commands:** A rich set of built-in commands (`/files`, `/edit`, `/commit`, `/model`, `/help`, etc.).
*   **Token Usage Tracking:** Monitor AI token consumption.
*   **Configurable AI Models:** Easily switch between different LLM providers and models.
*   **Shell Integration:** Execute shell commands inline using `!`command`` syntax.

## 🛠️ Technologies Used

Acai is built primarily with **TypeScript** and runs on **Node.js**. Key technologies and dependencies include:

*   **TypeScript:** For type-safe and scalable code.
*   **Node.js:** The JavaScript runtime environment.
*   **AI SDK (`@ai-sdk/*`):** For integrating with various Large Language Models (LLMs) like OpenAI, Google Gemini, Anthropic, DeepSeek, and OpenRouter.
*   **Tree-sitter:** For robust and efficient code parsing and syntax analysis across multiple programming languages (TypeScript, JavaScript, Java, Python).
*   **`chalk`, `ora`, `log-update`:** For rich and interactive terminal output.
*   **`@inquirer/prompts`:** For interactive prompts; CLI args parsed with Node's `util.parseArgs`.
*   **`ripgrep` (via `grep.ts` tool):** For fast file content searching.
*   **`marked`:** For rendering Markdown in the terminal.
*   **`pino`:** For structured logging.
*   **`zod`:** For schema validation.
*   **`biomejs/biome`:** For code formatting and linting.

## 🚀 Getting Started

### Prerequisites

**Required:**
*   Node.js 18.20.0 or higher
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

# X.AI (Grok models)
X_AI_API_KEY=your_xai_api_key_here
# Alternative name also supported:
# XAI_API_KEY=your_xai_api_key_here

# OpenRouter (Access to multiple models)
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

### Web Service API Keys (Optional)

```bash
# Exa (for enhanced web search functionality)
# Optional: Falls back to DuckDuckGo search if not provided
EXA_API_KEY=your_exa_api_key_here

# Jina Reader (for enhanced web content extraction)
JINA_READER_API_KEY=your_jina_api_key_here
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
OPENROUTER_API_KEY=sk-or-...

# Optional: Web services (fallbacks available if not provided)
EXA_API_KEY=...  # Falls back to DuckDuckGo search

# Optional: Application settings
LOG_LEVEL=info
```

**Note:** You need at least one AI provider API key to use Acai. The tool will work with any combination of the supported providers.

**Web Search:** The web search functionality works without any API keys by using DuckDuckGo as a fallback. Providing an EXA_API_KEY enables enhanced search capabilities with more detailed content extraction.

### Usage

```bash
# Start interactive mode with default model
acai

# Specify a model
acai --model anthropic:sonnet

# One-shot mode
acai -p "What files contain the term 'toolCallRepair'?" -o

# Pipe input
echo "How many TypeScript files are in this project?" | acai
```

Once in the REPL, you can type your prompts or use commands:

```
> How do I read a file in Node.js?
> /files add source/index.ts
> /edit source/cli.ts "Change this function name"
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

For a list of available commands, type `/help` within the REPL.

## Interactive CLI Commands

- `/help` - Shows usage information
- `/reset` - Saves chat history and resets the conversation
- `/save` - Saves chat history
- `/compact` - Saves, summarizes and resets the chat history
- `/exit` or `/bye` - Exits and saves chat history
- `/files [pattern]` - Select files interactively or by pattern, adding content to prompt
- `/init` - Generate or improve `AGENTS.md`
- `/editPrompt` - Edit the current prompt
- `/paste` - Add clipboard contents to the next prompt
- `/prompt <name>` - Load saved prompts. Project prompts override user prompts.
- `/rules [view|add <text>|edit]` - View or edit persistent project rules/memories (formerly /memory)
- `/model [provider:model|category|provider]` - List or switch models
- `/usage` - Show token usage breakdown
- `/clear` - Clears the terminal screen for the current session
- `/lastLog` - Show the last application log entries
- `/appLog` - Show or follow the application log
- `/generateRules` - Analyze the current conversation and suggest project rules
- `/edit <path> "<change description>"` - Edit a file with AI assistance
- `/copy` - Copy the last assistant response to the system clipboard

Clipboard notes:
- macOS: uses `pbcopy`
- Windows: uses `clip`
- Linux: tries `xclip`, falls back to `xsel`

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
  }
}
```

### Project-Specific Customization

- **Rules/Guidelines**: Add project-specific AI behavior rules in `AGENTS.md`
- **Custom Prompts**: Store reusable prompts in `.acai/prompts/`
- **Context Selections**: Save file/directory selections in `.acai/context/`
- **Memory/Rules**: Persistent project rules stored in `.acai/rules/`

### Global Configuration

Global application settings are stored in:
- **Configuration**: `~/.acai/`
- **Logs**: `~/.acai/logs/acai.log`
- **Message History**: `~/.acai/message-history/`

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

### Code Structure

The project is organized as follows:

```
.
├── .acai/             # Internal configuration, context, and temporary files
├── source/            # Main application source code
│   ├── cli.ts         # CLI entry point
│   ├── code-utils/    # Code parsing and navigation utilities (Tree-sitter)
│   ├── commands/      # Implementations of REPL commands (e.g., /edit, /commit)
│   ├── middleware/    # AI request/response middleware (logging, rate limiting)
│   ├── models/        # AI model providers and management
│   ├── prompts/       # Prompt generation and management
│   ├── terminal/      # Terminal output formatting and rendering
│   ├── tools/         # AI-callable tools (filesystem, git, web, bash, etc.)
│   └── ...            # Other core modules (config, logger, repl, token tracking)
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
