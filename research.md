# Codebase Research: Sessions, Tools, and Storage

## Research Question

This research investigates:
1. Where session files are stored and their naming patterns
2. The format/structure of session JSON files
3. How custom tools are registered in .acai/tools
4. The structure of existing tools in the source code

## Overview

The acai-ts project is a TypeScript-based AI coding assistant (REPL). This research covers the session management system for persisting conversation history, and the tool system for extending functionality with custom tools.

## Key Findings

### 1. Session File Storage

**Storage Location**: `~/.acai/sessions/`

**Directory Setup** (source/index.ts:154-155):
```typescript
const [sessionsDir, modelManager] = await Promise.all([
  appDir.ensurePath("sessions"),
  // ...
]);
```

**Session Directory Structure**:
- The app directory (`appDir`) resolves to `~/.acai/`
- Sessions are stored in the `sessions/` subdirectory
- Sessions are created in the `initializeSessionManager` function (source/index.ts:336-357)

### 2. Session File Naming Pattern

**Current Filename Format** (source/sessions/manager.ts:579-580):
```typescript
getSessionFileName(): string {
  return `session-${this.sessionId}.json`;
}
```

**Example filename**:
```
session-a1b2c3d4-e5f6-7890-1234-567890abcdef.json
```

**File Matching Pattern** (source/sessions/manager.ts:593-594):
```typescript
const sessionFiles = files.filter(
  (file) => file.startsWith("session-") && file.endsWith(".json"),
);
```

**Note**: There is a spec file (`specs/session-storage.md`) that describes a migration plan to add ISO 8601 timestamps to the filename format (e.g., `session-2026-01-19T15-30-00-a1b2c3d4-...json`), but this has not been implemented yet. The current implementation uses just the session UUID.

### 3. Session JSON Structure

**Type Definition** (source/sessions/manager.ts:169-184):

```typescript
export type SavedMessageHistory = {
  project: string;           // Project name (basename of cwd)
  sessionId: string;          // UUID for the session
  modelId: string;            // Model identifier used
  title: string;              // Auto-generated or user-set title
  createdAt: Date;           // Session creation timestamp
  updatedAt: Date;           // Last update timestamp
  messages: ModelMessage[];  // AI SDK message array
  tokenUsage?: TokenUsageTurn[]; // Optional token usage tracking
  metadata?: Record<string, unknown>; // Optional custom metadata
};
```

**Token Usage Type** (source/sessions/manager.ts:149-168):
```typescript
export type TokenUsageTurn = {
  stepIndex: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  inputTokenDetails: {
    noCacheTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  outputTokenDetails: {
    textTokens: number;
    reasoningTokens: number;
  };
  timestamp: number;
  estimatedCost: number;
};
```

**Message Format**: Uses AI SDK's `ModelMessage` type which includes:
- `UserModelMessage`: `{ role: "user", content: TextPart[] | ImagePart[] }`
- `AssistantModelMessage`: `{ role: "assistant", content: TextPart[] | ToolCallPart[] }`
- `ToolModelMessage`: `{ role: "tool", toolCallId: string, content: string }`

### 4. Custom Tool Registration in .acai/tools

**Tool Discovery Locations** (source/tools/dynamic-tool-loader.ts:283-284):
```typescript
const projectToolsDir = path.join(baseDir, ".acai", "tools");
const userToolsDir = path.join(os.homedir(), ".acai", "tools");
```

**Loading Order**: User tools are loaded first, then project tools (allowing project tools to override user tools)

**File Requirements**:
- Files must have `.js` or `.mjs` extension
- Tools are discovered via directory scanning in `loadDynamicTools()` function

**Tool Metadata Protocol**:

Tools respond to two environment variable modes:

1. **Describe Mode** (`TOOL_ACTION="describe"`):
   - Tool must output JSON metadata to stdout
   - Example from `.acai/tools/run-all-checks.mjs`:
   ```javascript
   if (process.env.TOOL_ACTION === 'describe') {
     console.log(JSON.stringify({
       name: 'run-all-checks',
       description: 'Run all checks in a project workspace...',
       parameters: [
         {
           name: 'dir',
           type: 'string',
           description: 'the workspace directory to run checks in',
           required: false,
           default: '.'
         }
       ],
       needsApproval: false,
     }, null, 2));
     process.exit(0);
   }
   ```

2. **Execute Mode** (`TOOL_ACTION="execute"`):
   - Parameters passed via stdin as JSON array
   - Example input format: `[{"name": "dir", "value": "."}]`
   - Output goes to stdout

**Tool Metadata Schema** (source/tools/dynamic-tool-loader.ts:11-26):
```typescript
const toolMetadataSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/),
  description: z.string().min(1),
  parameters: z.array(
    z.object({
      name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/),
      type: z.enum(["string", "number", "boolean"]),
      description: z.string().min(1),
      required: z.boolean().default(true),
      default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    }),
  ),
  needsApproval: z.boolean().default(true),
});
```

**Tool Naming**: Dynamic tools are prefixed with `dynamic-` when registered (source/tools/dynamic-tool-loader.ts:217):
```typescript
const toolName = `dynamic-${metadata.name}`;
```

### 5. Built-in Tool Structure

**Tool Directory**: `source/tools/`

**Tool Creation Pattern** (example from source/tools/think.ts):

```typescript
export const createThinkTool = () => {
  return {
    toolDef: {
      description: "Think through a problem step-by-step.",
      inputSchema: z.object({
        thought: z.string().describe("Your thought"),
      }),
    },
    display() {
      return "Logging thought";
    },
    async execute(
      { thought }: z.infer<typeof inputSchema>,
      { abortSignal }: ToolExecutionOptions,
    ): Promise<string> {
      // Tool implementation
      return `Thought: ${formattedThought}`;
    },
  };
};
```

**Tool Interface Requirements**:
- `toolDef`: Contains `description` (string) and `inputSchema` (Zod schema)
- `display()`: Returns a status string for UI
- `execute(input, options)`: Async function that takes parsed input and ToolExecutionOptions

**Tool Execution Options** (source/tools/types.ts:17-22):
```typescript
export type ToolExecutionOptions = {
  toolCallId: string;
  messages?: any[];
  abortSignal?: AbortSignal;
};
```

**Tool Registration** (source/tools/index.ts:39-85):

Tools are initialized and registered in the `initTools()` function:
```typescript
export async function initTools({
  workspace,
}: {
  workspace: WorkspaceContext;
}) {
  // Create tool instances
  const readFileTool = await createReadFileTool({ workspace });
  const bashTool = await createBashTool({ workspace, env: projectConfig.env });
  // ... more tools

  // Register with AI SDK
  const tools = {
    [EditFileTool.name]: editFileTool,
    [BashTool.name]: bashTool,
    // ... etc
  } as const;

  return tools;
}
```

**Built-in Tools List** (source/tools/index.ts):
| Tool Name | File | Purpose |
|-----------|------|---------|
| EditFile | edit-file.ts | Edit files using diffs |
| Bash | bash.ts | Execute shell commands |
| SaveFile | save-file.ts | Save file contents |
| ReadFile | read-file.ts | Read file contents |
| Glob | glob.ts | Find files by pattern |
| Grep | grep.ts | Search file contents |
| CodeSearch | code-search.ts | Semantic code search |
| DirectoryTree | directory-tree.ts | Show directory structure |
| Think | think.ts | Log thoughts/thinking |
| Ls | ls.ts | List directory contents |
| Skill | skill.ts | Execute skills |
| Agent | agent.ts | Create sub-agents |
| WebSearch | web-search.ts | Search the web |
| WebFetch | web-fetch.ts | Fetch web content |

## Architecture & Design Patterns

### Session Management Pattern

1. **Singleton Manager**: `SessionManager` class manages all session operations
2. **Event-driven**: Extends `EventEmitter` for title updates and history clearing
3. **Lazy Loading**: Sessions are loaded on-demand via `--continue` or `--resume` flags

**Flow**:
1. App initializes with `initializeSessionManager(sessionsDir, modelManager, tokenTracker)`
2. User can resume previous sessions via `--continue` (interactive selection) or `--resume <sessionId>`
3. Session is saved automatically after each interaction via `save()` method

### Dynamic Tool Loading Pattern

1. **Directory-based Discovery**: Scans `.acai/tools` directories for `.js`/`.mjs` files
2. **Metadata-driven**: Tools self-describe via `TOOL_ACTION="describe"` protocol
3. **Lazy Execution**: Parameters validated via Zod schemas before execution
4. **Process Isolation**: Each tool runs as separate Node.js child process

**Tool Execution Flow**:
1. `loadDynamicTools()` scans directories and calls each script with `TOOL_ACTION=describe`
2. Parsed metadata creates Zod input schemas
3. At execution time, `spawnChildProcess()` spawns Node with `TOOL_ACTION=execute`
4. Parameters passed via stdin as JSON

### File Naming Conventions

- **Sessions**: `session-${uuid}.json` (no timestamp in current implementation)
- **Dynamic Tools**: Must be `.js` or `.mjs` files
- **Tool Names**: Must match regex `/^[a-zA-Z_][a-zA-Z0-9_-]*$/`

## Integration Points

### Dependencies

- **SessionManager depends on**:
  - `ModelManager` (for model info)
  - `TokenTracker` (for usage tracking)
  - File system (fs/promises)

- **DynamicToolLoader depends on**:
  - `config` (for dynamicTools.enabled and maxTools settings)
  - Node.js `child_process` (for spawning)
  - Node.js `fs` (for directory scanning)

### Configuration

**Dynamic Tools Config** (checked in dynamic-tool-loader.ts:275-280):
```typescript
const projectConfig = await config.getConfig();
const dynamicConfig = projectConfig.tools.dynamicTools;

if (!dynamicConfig.enabled) {
  logger.info("Dynamic tools disabled in config.");
  return {};
}
```

**Default Limits**:
- Max dynamic tools: Configurable via `projectConfig.tools.dynamicTools.maxTools`
- Execution timeout: 30 seconds (hardcoded in spawnChildProcess)

## Edge Cases & Error Handling

### Session Edge Cases

1. **Empty files**: Silently skipped during load (line 622-627 in manager.ts)
2. **Malformed JSON**: Error logged, file skipped
3. **Missing dates**: Defaults to epoch (line 637-638)
4. **Empty message arrays**: Filtered out via `validMessage()` method
5. **Interrupted saves**: Uses temp file + atomic rename pattern (lines 387-391)

### Tool Edge Cases

1. **Invalid metadata**: Logged as warning, tool skipped
2. **Script spawn failure**: Returns null, logs error
3. **Execution timeout**: 30 second limit, then killed
4. **Max output**: Truncated at 2MB
5. **Invalid JSON output**: Falls back to raw string

### Dynamic Tool Loading

1. **Tool limit exceeded**: Uses slice to keep most recent (project) tools
2. **User vs Project conflict**: Project tools take precedence (loaded second)
3. **Disabled via config**: Returns empty object, logs info

## Known Limitations

1. **No timestamp in session filenames**: The spec mentions migration to add timestamps but not implemented
2. **Dual directory support**: Both `~/.acai/sessions/` and legacy `~/.acai/message-history/` may exist
3. **No session migration**: Old format files in message-history are not automatically migrated
4. **Tool execution isolation**: No true sandboxing - tools have full Node.js process access

## Testing Coverage

### Session Tests
- **File**: `test/commands/session-command.test.ts`
- Tests the session command handler with mocks

### Session Manager Tests
- **File**: `test/sessions/manager.test.ts` (referenced in specs)
- Tests save/load functionality

### Dynamic Tool Tests
- Not explicitly found in test directory
- Covered indirectly through integration tests

## References

### Key Source Files

| File | Purpose |
|------|---------|
| `source/sessions/manager.ts` | Session management, save/load logic |
| `source/index.ts` | App initialization, session manager setup |
| `source/tools/dynamic-tool-loader.ts` | Custom tool discovery and execution |
| `source/tools/index.ts` | Built-in tool registration |
| `source/tools/types.ts` | Tool execution options types |
| `source/tools/think.ts` | Example built-in tool implementation |
| `.acai/tools/run-all-checks.mjs` | Example custom tool |

### Configuration Files

| File | Purpose |
|------|---------|
| `.acai/acai.json` | Main app configuration |
| `specs/session-storage.md` | Session storage migration spec |

### Related Commands

- `--continue`: Resume from session list (source/index.ts:67)
- `--resume`: Resume specific session (source/index.ts:68)
- `--no-session`: Disable session saving (source/index.ts:71)
- `/session`: Command to show session info (test/commands/session-command.test.ts)
