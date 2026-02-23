# Acai-TS Codebase Research: CLI Arguments and Session Management

## Research Question

This research investigates four key aspects of the acai-ts codebase:
1. Where CLI arguments are parsed
2. How SessionManager works and its responsibilities
3. Where SessionManager is instantiated and used throughout the app
4. How sessions are saved to ~/.acai/sessions

## Overview

The acai-ts codebase is a CLI tool built with TypeScript/Node.js. It uses Node's built-in `parseArgs` for CLI argument handling (not commander or yargs). The SessionManager class is a central component responsible for managing conversation history, including message storage, session persistence, title generation, and token usage tracking.

## Key Findings

### 1. CLI Argument Parsing

**Location**: `source/index.ts` lines 5, 86-115

The application uses Node.js's built-in `parseArgs` from the `node:util` module, not an external library like commander or yargs.

```typescript
// Line 5
import { parseArgs } from "node:util";

// Lines 86-97
const parsed = syncTry(() =>
  parseArgs({
    options: {
      model: { type: "string", short: "m" },
      prompt: { type: "string", short: "p" },
      continue: { type: "boolean", default: false },
      resume: { type: "boolean", default: false },
      "add-dir": { type: "string", multiple: true },
      "no-skills": { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
    allowPositionals: true,
  }),
);
```

**Defined CLI Arguments**:

| Argument | Short | Type | Description |
|----------|-------|------|-------------|
| `--model` | `-m` | string | Sets the model to use |
| `--prompt` | `-p` | string | Sets the prompt (runs in CLI mode) |
| `--continue` | - | boolean | Select a conversation to resume from a list |
| `--resume` | - | boolean | Resume a specific session by ID, or most recent if no ID given |
| `--add-dir` | - | string (multiple) | Add additional working directory |
| `--no-skills` | - | boolean | Disable skills discovery and loading |
| `--help` | `-h` | boolean | Show help |
| `--version` | `-v` | boolean | Show version |

The help text is defined as a template literal at lines 57-83 in `source/index.ts`.

---

### 2. SessionManager Class

**Location**: `source/sessions/manager.ts`

The SessionManager class (defined at line 204) extends EventEmitter and is responsible for managing conversation state, message history, session persistence, and token usage tracking.

#### Constructor (lines 225-247)

```typescript
constructor({
  stateDir,
  modelManager,
  tokenTracker,
}: {
  stateDir: string;
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
}) {
  super();
  this.history = [];
  this.sessionId = randomUUID();
  this.modelId = modelManager.getModel("repl").modelId;
  this.title = "";
  this.createdAt = new Date();
  this.updatedAt = new Date();
  this.stateDir = stateDir;
  this.contextWindow = 0;
  this.modelManager = modelManager;
  this.tokenTracker = tokenTracker;
  this.tokenUsage = [];
}
```

#### Key Responsibilities:

1. **Message History Management**:
   - `get()` - Returns filtered message history (lines 279-290)
   - `appendUserMessage()` - Adds user messages (lines 306-326)
   - `appendAssistantMessage()` - Adds assistant messages (lines 328-335)
   - `appendResponseMessages()` - Adds response messages with sanitization (lines 344-350)
   - `appendToolMessages()` - Adds tool result messages

2. **Session Persistence**:
   - `save()` - Saves session to disk with atomic write (lines 352-411)
   - `load()` - Static method to load sessions from disk (lines 466-578)
   - `restore()` - Restores session from SavedMessageHistory (lines 581-612)

3. **Title Generation**:
   - Automatically generates conversation titles using AI (lines 413-459)
   - Uses the "title-conversation" model

4. **Token Usage Tracking**:
   - `recordTurnUsage()` - Records token usage for each turn (lines 621-649)
   - `getTokenUsage()` - Returns all recorded token usage
   - `getTotalTokenUsage()` - Returns aggregated token usage

5. **Session Metadata**:
   - `setMetadata()` / `getMetadata()` - Store and retrieve custom metadata

#### Data Structures

**SavedMessageHistory** (lines 166-180):
```typescript
export type SavedMessageHistory = {
  project: string;
  sessionId: string;
  modelId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ModelMessage[];
  tokenUsage?: TokenUsageTurn[];
  metadata?: Record<string, unknown>;
};
```

---

### 3. SessionManager Instantiation and Usage

#### Instantiation

**Primary instantiation** in `source/index.ts` lines 335-355:

```typescript
async function initializeSessionManager(
  sessionsDir: string,
  modelManager: ModelManager,
  tokenTracker: TokenTracker,
): Promise<SessionManager> {
  const sessionManager = new SessionManager({
    stateDir: sessionsDir,
    modelManager,
    tokenTracker,
  });

  return sessionManager;
}
```

The `sessionsDir` is obtained from `appDir.ensurePath("sessions")` where `appDir` points to `~/.acai` (see Configuration section below).

#### Usage Throughout the App

| Component | File | Usage |
|-----------|------|-------|
| **Agent** | `source/agent/index.ts` | Receives SessionManager in AgentOptions (line 35), uses for message handling |
| **CLI** | `source/cli/index.ts` | Uses sessionManager.save() after CLI execution (lines 103, 131) |
| **CommandManager** | `source/commands/manager.ts` | Stores sessionManager reference (line 51) |
| **History Command** | `source/commands/history/index.ts` | Uses SessionManager.load() to list sessions (line 102) |
| **REPL** | `source/repl/index.ts` | Saves session after each turn (lines 496, 519, 979), creates new sessions (line 980) |
| **Exit Summary** | `source/sessions/summary.ts` | Formats session information for display |

---

### 4. Session Saving to ~/.acai/sessions

#### Configuration

**Location**: `source/config/index.ts` lines 125-132

```typescript
export class ConfigManager {
  readonly project: DirectoryProvider;
  readonly app: DirectoryProvider;

  constructor() {
    this.project = new DirectoryProvider(path.join(process.cwd(), ".acai"));
    this.app = new DirectoryProvider(path.join(homedir(), ".acai"));
  }
}
```

The `app` DirectoryProvider points to `path.join(homedir(), ".acai")` which resolves to `~/.acai`.

#### Session Directory Creation

In `source/index.ts` lines 150-156:

```typescript
const appDir = config.app;

const [sessionsDir, modelManager] = await Promise.all([
  appDir.ensurePath("sessions"),  // Creates ~/.acai/sessions
  initializeModelManager(appDir),
]);
```

#### Save Process

**Location**: `source/sessions/manager.ts` lines 352-411

The `save()` method:
1. Writes to a temporary file first (`.tmp` suffix)
2. Uses atomic rename to move to final location
3. Cleans up temp file on failure

```typescript
async save() {
  const msgHistoryDir = this.stateDir;
  const fileName = this.getSessionFileName();
  const filePath = join(msgHistoryDir, fileName);
  const tempFilePath = `${filePath}.tmp`;

  // ... validation ...

  const output: SavedMessageHistory = {
    project,
    sessionId: this.sessionId,
    modelId: this.modelId,
    title: this.title,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    messages: this.history,
    tokenUsage: this.tokenUsage,
    metadata: Object.keys(this.metadata).length > 0 ? this.metadata : undefined,
  };

  await writeFile(tempFilePath, JSON.stringify(output, null, 2));
  await rename(tempFilePath, filePath);
}
```

#### File Naming Convention

- Format: `session-{uuid}.json`
- Example: `session-a1b2c3d4-e5f6-7890-1234-567890abcdef.json`
- Full path: `~/.acai/sessions/session-{uuid}.json`

#### When Sessions Are Saved

1. **After each turn in REPL** (`source/repl/index.ts`):
   - Line 496: After tool execution
   - Line 519: After message handling
   - Line 979: After completion

2. **On interrupt/ctrl+c** (`source/index.ts` line 493):
   ```typescript
   repl.setInterruptCallback(async () => {
     try {
       await state.sessionManager.save();
     } catch (error) {
       logger.warn({ error }, "Failed to save message history on interrupt");
     }
   });
   ```

3. **After CLI execution** (`source/cli/index.ts` lines 103, 131):
   ```typescript
   await sessionManager.save();
   ```

#### Loading Sessions

**Static method** `SessionManager.load(stateDir, count)` (lines 466-578):
- Loads session files sorted by modification time (newest first)
- Skips empty or malformed files
- Returns `SavedMessageHistory[]` array
- Used for `--continue` and `--resume` flags

---

## Architecture & Design Patterns

### Pattern 1: Singleton-like Config Manager
- **Description**: ConfigManager is instantiated once and provides DirectoryProvider instances for both project (`./.acai`) and app (`~/.acai`) directories
- **Example**: `source/config/index.ts` lines 115-133
- **When Used**: Application-wide configuration access

### Pattern 2: EventEmitter for Session Updates
- **Description**: SessionManager extends EventEmitter to notify components of session changes
- **Events**: `"update-title"`, `"clear-history"`
- **Example**: `source/sessions/manager.ts` line 204
- **When Used**: When session title changes or history is cleared

### Pattern 3: Atomic File Writes
- **Description**: Sessions are written to temp files then renamed atomically to prevent corruption
- **Example**: `source/sessions/manager.ts` lines 379-385
- **When Used**: Critical file operations where corruption would cause data loss

### Pattern 4: Message Sanitization
- **Description**: Tool call inputs are sanitized before being added to history to prevent malformed JSON
- **Example**: `source/sessions/manager.ts` lines 68-130
- **When Used**: When appending assistant/tool messages to history

---

## Data Flow

1. **CLI Entry Point**:
   - `bin/acai` shell script → `node dist/index.js`

2. **Argument Parsing**:
   - `source/index.ts`: `parseArgs()` → `flags` object + `input` positionals

3. **Session Manager Initialization**:
   - `config.app.ensurePath("sessions")` → `~/.acai/sessions`
   - `new SessionManager({stateDir, modelManager, tokenTracker})`

4. **Session Loading (--continue/--resume)**:
   - `SessionManager.load(sessionsDir, count)` → `SavedMessageHistory[]`
   - `sessionManager.restore(history)` → populates session state

5. **Message Flow During Execution**:
   - User input → `promptManager` → `agent.run()` → `sessionManager.append*Message()`
   - After each turn: `sessionManager.save()` → writes `~/.acai/sessions/session-{uuid}.json`

---

## Components & Files

### Core Components

| Component | File(s) | Responsibility |
|-----------|---------|----------------|
| **CLI Entry** | `source/index.ts` | Parses CLI arguments, initializes app state, runs REPL or CLI |
| **SessionManager** | `source/sessions/manager.ts` | Manages message history, session persistence, token tracking |
| **ConfigManager** | `source/config/index.ts` | Provides directory paths, merged config (project + app) |
| **DirectoryProvider** | `source/config/index.ts` | Helper class for path management and directory creation |
| **REPL** | `source/repl/index.ts` | Interactive terminal interface, triggers session saves |
| **Agent** | `source/agent/index.ts` | AI agent that processes messages |
| **CLI Handler** | `source/cli/index.ts` | Non-interactive CLI mode handler |

### Configuration

- **Config files**: `~/.acai/acai.json`, `./.acai/acai.json` (project overrides app)
- **Sessions directory**: `~/.acai/sessions/`
- **Session file format**: `session-{uuid}.json`

---

## Edge Cases & Error Handling

### Edge Cases
- **Empty session files**: Skipped during load (line 578-582)
- **Malformed JSON**: Caught and logged, file skipped
- **Interrupted saves**: Temp files cleaned up, warning logged
- **Missing session on resume**: Error message and exit

### Error Handling
- **Save failures**: Logged but don't throw (called from interrupt handlers)
- **Load failures**: Returns empty array, logs error
- **Title generation failures**: Falls back to first 50 chars of first message

---

## Testing Coverage

No specific test files were found for SessionManager in the search. Test files present:
- `test/config.test.ts`
- `test/execution.test.ts`
- `test/skills.test.ts`
- `test/stdin-handling.test.ts`
- `test/env-expand.test.ts`
- `test/mentions.test.ts`
- `test/messages.test.ts`

---

## References

### Source Files
- **Main entry**: `source/index.ts`
- **SessionManager**: `source/sessions/manager.ts`
- **Configuration**: `source/config/index.ts`
- **CLI handler**: `source/cli/index.ts`
- **REPL**: `source/repl/index.ts`
- **Agent**: `source/agent/index.ts`
- **History command**: `source/commands/history/index.ts`
- **Session summary**: `source/sessions/summary.ts`

### Entry Point
- **Shell wrapper**: `bin/acai`
- **Compiled entry**: `dist/index.js`
