# @travisennis/acai

Acai is an interactive CLI tool that assists with software engineering tasks using AI. It provides an intelligent command-line interface that can help with code analysis, file manipulation, git operations, and more.

## Features

- Interactive chat interface with AI assistance
- Support for various AI models (Claude, OpenAI, etc.)
- File system operations (read, write, search, grep)
- Git integration (status, commit, diff, log)
- Code tooling (build, test, lint, format)
- Code interpreter for JavaScript execution
- Token usage tracking and optimization
- Prompt optimization and file retrieval
- Context preservation across sessions

## Installation

```bash
npm install @travisennis/acai
```

## Usage

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

## Commands

Within the interactive CLI, you can use the following commands:

- `/help` - Shows usage information
- `/reset` - Saves chat history and resets the conversation
- `/save` - Saves chat history
- `/compact` - Saves, summarizes and resets the chat history
- `/exit` or `/bye` - Exits and saves chat history
- `/files [pattern]` - Finds files matching the pattern and adds their content to the next prompt

## Configuration

Acai supports project-specific configuration through a `.acai/acai.json` file in your project directory:

```json
{
  "build": "npm run build",
  "test": "npm run test",
  "lint": "npm run lint",
  "format": "npm run format"
}
```

You can also add project-specific rules in a `.acai/rules.md` file.

### Logs

Application logs are stored in the system's XDG state directory:
- Linux: `~/.local/state/acai/`
- macOS: `~/Library/Application Support/acai/`
- Windows: `%LOCALAPPDATA%/acai/`

## Directory Structure
- `source/` - Main source code
  - `command.ts` - Terminal output utilities
  - `config.ts` - Configuration loading and handling
  - `fileRetriever.ts` - Intelligent file retrieval for tasks
  - `index.ts` - CLI entry point and argument parsing
  - `logger.ts` - Logging utilities
  - `parsing.ts` - JSON parsing utilities
  - `promptOptimizer.ts` - AI prompt optimization
  - `prompts.ts` - System prompts for AI models
  - `repl.ts` - Interactive read-eval-print loop implementation

## Requirements

- Node.js 16.x or higher
- Git (for git-related features)
- Ripgrep (for file search)

## License

MIT
