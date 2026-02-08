# Acai: AI-Powered Software Development Assistant

![Project Status](https://img.shields.io/badge/Status-Active-brightgreen)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

## Overview

Acai is an AI-driven command-line tool that assists software developers with coding, debugging, refactoring, and workflow automation. It provides both a conversational REPL and a modern TUI for interacting with large language models in the context of your codebase.

### Key Capabilities

- **Interactive AI Assistant:** Conversational REPL and TUI with modal dialogs, autocomplete, and rich text formatting.
- **Codebase Interaction:** Read, edit, search, and navigate files with context-aware AI assistance.
- **Git Integration:** Generate conventional commits, review pull requests, and manage local changes.
- **Multi-Model Support:** Switch between OpenAI, Anthropic, Google, DeepSeek, Groq, X.AI, OpenRouter, and OpenCode Zen.
- **Piped Input:** Pipe text via stdin for REPL mode or as context with the `-p` flag.
- **Skills System:** Discover and load specialized instruction files for specific tasks.
- **Multi-workspace Support:** Work across multiple project directories simultaneously.

## Prerequisites

- Node.js 20 or higher
- Git
- [Ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`) - Fast file content searching
- [GitHub CLI](https://cli.github.com/) (`gh`) - Git operations and repository management

```bash
# macOS
brew install ripgrep gh

# Ubuntu/Debian
sudo apt install ripgrep gh
```

## Installation

```bash
npm install -g @travisennis/acai
```

## Quick Start

```bash
# Start interactive mode
acai

# Specify a model
acai --model anthropic:sonnet

# One-shot CLI mode
acai -p "What files contain the term 'toolCallRepair'?"

# Pipe input
echo "How many TypeScript files are in this project?" | acai

# Resume a previous session
acai --resume
```

Once in the REPL, type prompts or use commands:

```
> How do I read a file in Node.js?
> @source/index.ts
> /help
```

Reference files directly with `@filename`, directories with `@dirname`, or run shell commands with `` !`command` ``.

## Technologies

- **TypeScript** and **Node.js**
- **AI SDK (`@ai-sdk/*`)** for LLM provider integration
- **Ripgrep** for fast file content searching
- **Pino** for structured logging
- **Zod** for schema validation
- **Biome** for formatting and linting

## Project Structure

```
.
├── source/            # Main application source code
│   ├── agent/         # Agent loop and sub-agent execution
│   ├── cli.ts         # CLI entry point
│   ├── commands/      # REPL command implementations
│   ├── execution/     # Command execution utilities
│   ├── middleware/     # AI request/response middleware
│   ├── models/        # AI model providers and management
│   ├── modes/         # Agent mode management
│   ├── prompts/       # Prompt generation and management
│   ├── repl/          # REPL utilities
│   ├── sessions/      # Session persistence and management
│   ├── terminal/      # Terminal output formatting and rendering
│   ├── tui/           # Terminal User Interface components
│   ├── tools/         # AI-callable tools (filesystem, git, web, bash, etc.)
│   ├── tokens/        # Token counting and tracking
│   └── utils/         # Utility functions
├── test/              # Unit tests
├── docs/              # Additional documentation
├── ARCHITECTURE.md    # Detailed architectural overview and flow diagrams
├── CONTRIBUTING.md    # Development setup and guidelines
└── AGENTS.md          # Project-specific AI rules and guidelines
```

## Documentation

- [Usage Guide](docs/usage.md) - Commands, keyboard shortcuts, piped input, and prompt syntax
- [Configuration](docs/configuration.md) - Environment variables, project and global settings
- [Skills System](docs/skills.md) - Creating and using specialized instruction files
- [Architecture](ARCHITECTURE.md) - Internal architecture and flow diagrams
- [Contributing](CONTRIBUTING.md) - Development setup, scripts, and code style

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
