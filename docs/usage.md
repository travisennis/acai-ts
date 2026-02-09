# Usage

## Running Acai

```bash
# Start interactive mode with default model
acai

# Specify a model
acai --model anthropic:sonnet

# CLI mode (one-shot execution)
acai -p "What files contain the term 'toolCallRepair'?"

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

When exiting a session with messages, Acai displays a resume command with the session ID:
```
To resume this session call acai --resume <session-id>
```

Using `-p/--prompt` runs in CLI mode (one-shot execution), while running without a prompt starts interactive REPL mode.

## Piped Input

You can pipe text directly to acai via stdin:

```bash
# REPL mode: piped text becomes the initial prompt
echo "What can you do?" | acai

# CLI mode: piped text becomes additional context
echo "Codebase overview: 50 files, TypeScript project" | acai -p "Summarize this project"

# Multiple inputs
echo "Large context file" | acai -p "Analyze and improve"
```

**Input size limits:**
- **Soft limit (50KB):** Warning logged to stderr, processing continues
- **Hard limit (200KB):** Error displayed, process exits with code 1

**Empty input handling:**
- Empty stdin without `-p` flag: Prints message and exits with code 0
- Empty stdin with `-p` flag: Proceeds normally (no context added)

## Prompt Mentions & Special Syntax

Reference files and directories directly in your prompts:

```
> Explain the purpose of @source/index.ts
> What patterns do you see in @source/tools/ directory
> Check if `!ls -la` shows any suspicious files
> Analyze @README.md for typos
```

**Supported syntax:**
- `@filename` - Include contents of a specific file
- `@dirname` - Recursively include all files in a directory
- `@http://example.com` - Fetch and include web content
- `` !`command` `` - Execute shell command and include output

## Interactive CLI Commands

- `/help` - Shows usage information
- `/init` - Generate or improve `AGENTS.md`
- `/paste` - Add clipboard contents to the next prompt
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
- `/init-project` - Initialize a new acai project in the current directory
- `/pickup` - Resume a previous conversation
- `/handoff` - Hand off conversation to another agent
- `/share` - Share the current session as a GitHub Gist for viewing in a web browser
- `/resources` or `/res` - List all active skills and AGENTS.md files
- `/shell` - Execute shell commands

Use `/help` within the REPL to see the latest available commands.

## Keyboard Shortcuts

These shortcuts work in the interactive TUI mode:

### Global Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl+C` | First press: clears the editor and shows exit confirmation. Second press within 1 second: exits the application. |
| `Ctrl+D` | Exits the application only when the editor is empty. |
| `Ctrl+N` | Starts a new chat session (saves current session first if not empty). |
| `Ctrl+O` | Toggles verbose mode (shows detailed tool execution output). |
| `Ctrl+R` | Opens the review view (equivalent to `/review`). |
| `Ctrl+Z` | Backgrounds the process (POSIX only; use `fg` to resume). |
| `Shift+Tab` | Cycles through available modes (Normal, Planning, Research, etc.). |
| `Escape` | Closes active modal dialogs or interrupts ongoing processing. |

### Editor Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Enter` | Creates a new line. |
| `Shift+Enter` / `Ctrl+Enter` / `Option+Enter` | Submits the prompt. |
| `Tab` | Triggers autocomplete suggestions. |
| `Escape` | Cancels autocomplete or closes custom handlers. |
| `Up` / `Down` | Navigates command history when the editor is empty. |
| `Ctrl+A` | Moves the cursor to the start of the line. |
| `Ctrl+E` | Moves the cursor to the end of the line. |
| `Ctrl+K` | Deletes from the cursor to the end of the line. |
| `Ctrl+U` | Deletes from the cursor to the start of the line. |
| `Ctrl+W` / `Option+Backspace` | Deletes the word before the cursor. |
| `Ctrl+Left` / `Ctrl+Right` / `Option+Left` / `Option+Right` | Navigates by words. |
| `Ctrl+G` | Launches the external editor (configured via `EDITOR` or `VISUAL` env var). |

### Clipboard Operations

| Platform | Command |
| :--- | :--- |
| macOS | `pbcopy` |
| Windows | `clip` |
| Linux | `xclip` (falls back to `xsel` if unavailable) |
