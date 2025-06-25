# @travisennis/acai

Acai is an interactive CLI tool that assists with software engineering tasks using AI. It provides an intelligent command-line interface that can help with code analysis, file manipulation, git operations, LSP integration, log searching, and more.

## Features

- Interactive chat interface with AI assistance
- Support for various AI models (Anthropic Claude, OpenAI GPT, Google Gemini [Pro 2.5, Flash 2.5], DeepSeek, XAI Grok, OpenAI [O3, O4-mini]) - Default: Google Gemini Pro 2.5
- File system operations (read with token limits, write, delete, search, grep, list, tree)
- Git integration (status, commit, diff, log, branch, show) with improved output (JSON status, diff stats)
- Code tooling (build, test, lint (including single file), format, install dependencies)
- Code interpreter for JavaScript execution
- Token usage tracking and optimization
- Prompt optimization and file retrieval
- Language Server Protocol (LSP) server for editor integration
- Log searching capabilities (`searchLogs` tool)
- Efficient multi-edit code editor (`codeEditor` tool)
- Enhanced UI/Output (syntax highlighting for diffs, improved tables, smoother streaming)
- Context preservation across sessions
- Persistent project rules and user memories
- Web search capabilities (`webSearch` tool)
- Execute whitelisted shell commands (`bashTool` tool)
- @Mentions for easy file/URL context injection
- System notifications on task completion (configurable)
- Enhanced `fetch` tool for better URL content retrieval

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

# Start the Language Server Protocol server
acai-lsp
```

## Interactive CLI Commands

- `/help` - Shows usage information
- `/reset` - Saves chat history and resets the conversation
- `/save` - Saves chat history
- `/compact` - Saves, summarizes and resets the chat history
- `/exit` or `/bye` - Exits and saves chat history
- `/files [pattern]` - Select files interactively or by pattern, adding content to prompt
- `/commit [args]` - Generate Conventional Commits for current changes (accepts args for prompt customization)
- `/review [PR#|local]` - Review a GitHub pull request or local changes
- `/init` - Generate or improve `AGENTS.md`
- `/editPrompt` - Edit the current prompt
- `/paste` - Add clipboard contents to the next prompt
- `/selections [use|edit|clear]` - Manage saved code selections
- `/ptree` - Show project directory tree
- `/prompt user:name|project:name` - Load saved prompts
- `/rules [view|add <text>|edit]` - View or edit persistent project rules/memories (formerly /memory)
- `/model [provider:model|category|provider]` - List or switch models
- `/pr-comments [PR#] [instructions]` - Add review comments to a GitHub PR
- `/usage` - Show token usage breakdown
- `/clear` - Clears the terminal screen for the current session
- `/usage` - Show token usage breakdown

## Configuration

Acai supports project-specific configuration through a `.acai/acai.json` file in your project directory:

```json
{
  "build": "npm run build",
  "test": "npm run test",
  "lint": "npm run lint",
  "format": "npm run format",
  "install": "npm install",
  "logPath": "~/.acai/logs/acai.log", // Optional: Customize log file location
  "notify": true, // Optional: Enable/disable system notifications (default: false)
  "maxTokens": { // Optional: Set max token limits per tool
    "readFile": 10000
  },
  "google": { // Optional: Google-specific settings
    "thinkingBudget": 5000 // Example: Limit tokens for Gemini's internal thinking
  }
}
```

You can also add project-specific rules in a `AGENTS.md` file.

Project prompts can be stored in `.acai/prompts/` and context selections in `.acai/context/`.

### Logs

Application logs are stored in:
- `~/.acai/logs/`

## Requirements

- Node.js 18.x or higher
- Git
- Ripgrep (`rg` command)
- GitHub CLI (`gh` command)

## License

MIT
