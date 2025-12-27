# Implementation Plan: Configurable Active Tools

## Overview
Enable users to configure which tools are available in CLI and Agent modes via the `acai.json` configuration file.

## Current State Analysis

### 1. Current Hardcoded Tool Sets

**CLI Mode (`source/cli.ts`)**:
```typescript
const activeTools = [
  EditFileTool.name,      // "editFile"
  ReadFileTool.name,      // "readFile"
  BashTool.name,          // "bash"
  GrepTool.name,          // "grep"
  GlobTool.name,          // "glob"
  CodeInterpreterTool.name, // "codeInterpreter"
];
```

**Agent Mode (`source/agent/index.ts`)**:
```typescript
activeTools: ["bash", "codeInterpreter", "think", "agent"],
```

### 2. Current Configuration Structure (`source/config.ts`)
- Uses Zod schemas for type-safe configuration
- Hierarchical: app config (`~/.acai/`) + project config (`./.acai/`) with project precedence
- Current `tools` configuration only includes:
  - `maxTokens`: number
  - `maxResults`: number
  - `dynamicTools`: { enabled: boolean, maxTools: number }

### 3. Tool System Architecture
- Tools defined with `name` property (e.g., `EditFileTool.name = "editFile"`)
- Dynamic tools loaded from `.acai/tools/` directories
- Separate initialization for CLI vs REPL/Agent modes

## Implementation Plan

### Phase 1: Update Configuration Schema (`source/config.ts`)

#### 1.1 Update `defaultConfig` object:
```typescript
const defaultConfig = {
  loop: {
    maxIterations: 90,
  },
  tools: {
    maxTokens: 30000,
    maxResults: 30,
    dynamicTools: {
      enabled: true,
      maxTools: 10,
    },
    activeTools: {
      cli: ["editFile", "readFile", "bash", "grep", "glob", "codeInterpreter"],
      agent: ["bash", "codeInterpreter", "think", "agent"],
    },
  },
  notify: true,
  readOnlyFiles: [] as string[],
} as const;
```

#### 1.2 Update `ProjectConfigSchema`:
```typescript
const ProjectConfigSchema = z.object({
  // ... existing fields ...
  tools: z
    .object({
      maxTokens: z.number().default(defaultConfig.tools.maxTokens),
      maxResults: z.number().default(defaultConfig.tools.maxResults),
      dynamicTools: z
        .object({
          enabled: z
            .boolean()
            .default(defaultConfig.tools.dynamicTools.enabled),
          maxTools: z
            .number()
            .default(defaultConfig.tools.dynamicTools.maxTools),
        })
        .optional()
        .default(defaultConfig.tools.dynamicTools),
      activeTools: z
        .object({
          cli: z
            .array(z.string())
            .optional()
            .default(defaultConfig.tools.activeTools.cli),
          agent: z
            .array(z.string())
            .optional()
            .default(defaultConfig.tools.activeTools.agent),
        })
        .optional()
        .default(defaultConfig.tools.activeTools),
    })
    .optional()
    .default(defaultConfig.tools),
  // ... existing fields ...
});
```

### Phase 2: Update Agent Mode (`source/agent/index.ts`)

#### 2.1 Modify the `run` method (line ~209):
```typescript
// Current hardcoded line (line 209):
activeTools: ["bash", "codeInterpreter", "think", "agent"],

// Replace with:
activeTools: (await config.readProjectConfig()).tools.activeTools.agent,
```

#### 2.2 Ensure async config reading:
The `run` method is already async, so we can read config inside it. Need to pass or read config in the Agent class.

### Phase 3: Update CLI Mode (`source/cli.ts`)

#### 3.1 Remove hardcoded `activeTools` array (lines 36-42):
```typescript
// Remove:
const activeTools = [
  EditFileTool.name,
  ReadFileTool.name,
  BashTool.name,
  GrepTool.name,
  GlobTool.name,
  CodeInterpreterTool.name,
];
```

#### 3.2 Read from config in `run` method (line ~103):
```typescript
// Current (line 103):
activeTools,

// Replace with:
activeTools: (await config.readProjectConfig()).tools.activeTools.cli,
```

#### 3.3 Update CLI class structure:
The `run` method needs to be async to read config, or we need to read config once and cache it.

### Phase 4: Configuration File Examples

#### 4.1 Minimal configuration (`.acai/acai.json`):
```json
{
  "tools": {
    "activeTools": {
      "cli": ["editFile", "bash", "codeInterpreter"],
      "agent": ["bash", "think", "agent"]
    }
  }
}
```

#### 4.2 Full configuration example:
```json
{
  "logs": {
    "path": "/Users/user/.acai/logs/current.log"
  },
  "agentLoop": "manual",
  "tools": {
    "maxTokens": 30000,
    "maxResults": 30,
    "dynamicTools": {
      "enabled": true,
      "maxTools": 10
    },
    "activeTools": {
      "cli": ["editFile", "readFile", "bash", "grep", "glob", "codeInterpreter"],
      "agent": ["bash", "codeInterpreter", "think", "agent"]
    }
  },
  "notify": true,
  "readOnlyFiles": ["package.json", "tsconfig.json"]
}
```

### Phase 5: Available Tool Names Reference

#### Core Tools:
- `"editFile"` - Edit files
- `"readFile"` - Read files
- `"bash"` - Execute bash commands
- `"saveFile"` - Save new files

- `"moveFile"` - Move/rename files
- `"readMultipleFiles"` - Read multiple files
- `"glob"` - File globbing
- `"grep"` - Search files
- `"directoryTree"` - Directory tree view
- `"codeInterpreter"` - Code interpretation
- `"think"` - Structured reasoning
- `"webFetch"` - Fetch web content
- `"webSearch"` - Web search
- `"batch"` - Batch tool execution
- `"agent"` - Agent tool (for sub-agents)

#### Dynamic Tools:
- Loaded from `.acai/tools/` directories
- Tool names determined by file names/definitions
- Must be explicitly added to `activeTools` if desired

### Phase 6: Implementation Details

#### 6.1 Backward Compatibility:
- If `activeTools` not in config, use schema defaults
- If `activeTools.cli` or `activeTools.agent` missing, use respective defaults
- Existing configs continue to work with new defaults

#### 6.2 Error Handling:
- Invalid tool names handled by AI SDK (will cause tool call errors)
- No validation at config level - users responsible for valid tool names
- Empty array = no tools available (probably not useful but allowed)

#### 6.3 Performance Considerations:
- Config read once per CLI/Agent run (cached by config manager)
- No significant performance impact

### Phase 7: Testing Strategy

#### 7.1 Unit Tests:
- Config schema validation with activeTools
- Default values correctly applied
- Project config overrides app config

#### 7.2 Integration Tests:
- CLI mode with default activeTools
- CLI mode with custom activeTools
- Agent mode with default activeTools
- Agent mode with custom activeTools
- Invalid tool names produce appropriate errors

#### 7.3 Manual Testing:
1. Default configuration (no `acai.json` changes)
2. Custom CLI tools only
3. Custom Agent tools only
4. Both custom configurations
5. Empty tool arrays (edge case)
6. Non-existent tool names

### Phase 8: Rollout Plan

#### 8.1 Implementation Order:
1. Update `config.ts` schema and defaults
2. Update `agent/index.ts` to use config
3. Update `cli.ts` to use config
4. Run typecheck: `npm run typecheck`
5. Run tests: `npm test`
6. Manual testing with various configurations

#### 8.2 Verification Steps:
- [ ] TypeScript compiles without errors
- [ ] All existing tests pass
- [ ] CLI mode works with default tools
- [ ] Agent mode works with default tools
- [ ] Custom configs work in both modes
- [ ] Backward compatibility maintained

### Phase 9: Potential Issues and Solutions

#### 9.1 Tool Dependencies:
- **Issue**: Some tools might depend on others (e.g., batch tool needs other tools)
- **Solution**: Document tool dependencies; users responsible for including required tools

#### 9.2 Dynamic Tools:
- **Issue**: Dynamic tools loaded but not in activeTools by default
- **Solution**: Users must explicitly add dynamic tool names to activeTools

#### 9.3 Security Considerations:
- **Issue**: Users could disable all tools or enable dangerous combinations
- **Solution**: This is a power-user feature; document security implications

#### 9.4 Configuration Validation:
- **Issue**: No validation of tool names at config load time
- **Solution**: Could add optional validation with warning logs

### Phase 10: Documentation Updates

#### 10.1 Configuration Documentation:
- Update README or config documentation
- Examples of common configurations
- Tool name reference list

#### 10.2 Migration Guide:
- For existing users: no changes needed (backward compatible)
- For custom configurations: how to use new feature

## Summary

This implementation provides:
1. **Flexibility**: Users control exactly which tools are available
2. **Mode-specific configurations**: Different tools for CLI vs Agent modes
3. **Backward compatibility**: Existing configs work with sensible defaults
4. **Simple implementation**: Minimal changes to existing codebase
5. **Type safety**: Full TypeScript support with Zod validation

The feature aligns with the project's philosophy of being configurable and user-controlled while maintaining safety through sensible defaults.