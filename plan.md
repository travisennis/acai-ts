# Custom Environment Variables for ExecutionEnvironment — Implementation Plan

## Overview

Add support for user-defined environment variables in `acai.json` that are passed to the `ExecutionEnvironment` used by the Bash tool. Values support `$VAR` / `${VAR}` expansion against `process.env`, enabling users to reference shell-level secrets without committing them to config.

## GitHub Issue Reference

- Issue URL: https://github.com/travisennis/acai-ts/issues/117

## Current State Analysis

- `ExecutionConfig.execution.env` already accepts `Record<string, string>` and merges it into the environment ([source/execution/index.ts#L97-L99](file:///Users/travisennis/Projects/acai-ts/source/execution/index.ts#L97-L99))
- `ProjectConfigSchema` has no `env` field ([source/config.ts#L25-L56](file:///Users/travisennis/Projects/acai-ts/source/config.ts#L25-L56))
- `createBashTool` hardcodes its env vars and doesn't read from config ([source/tools/bash.ts#L269-L276](file:///Users/travisennis/Projects/acai-ts/source/tools/bash.ts#L269-L276))
- Config merging uses shallow spread (`{ ...appConfig, ...projectConfig }`) — project wins at the top-level key ([source/config.ts#L134-L137](file:///Users/travisennis/Projects/acai-ts/source/config.ts#L134-L137))

### Key Discoveries:
- The `env` merge must be deep (per-key) since both global and project configs may define different vars
- Variable expansion must happen at read-time (in `getConfig` or at consumption), not at write-time, so `process.env` is always current
- The Bash tool is created in `createBashTool` which receives a `WorkspaceContext` but not the config — config access needs to be threaded through

## Desired End State

Users can add an `"env"` key to `acai.json` (global or project-level):

```json
{
  "env": {
    "DATABASE_URL": "postgres://localhost:5432/mydb",
    "API_KEY": "$MY_SECRET_API_KEY",
    "CUSTOM_PATH": "${HOME}/tools/bin"
  }
}
```

- Literal values are passed through as-is
- `$VAR` and `${VAR}` references are expanded against `process.env` at config load time
- Undefined references resolve to empty string
- Project-level env vars override global-level env vars (per-key)
- These env vars are injected into the `ExecutionEnvironment` used by the Bash tool
- Documentation warns users not to store sensitive values directly in `acai.json`

## What We're NOT Doing

- `.acai/env` or `.env` file support (future enhancement)
- Runtime `/config` command for setting env vars
- Full shell expansion (command substitution, arithmetic, etc.)
- Recursive expansion (`$VAR` referencing another `$VAR2`)

## Implementation Approach

Three phases: (1) add env expansion utility + config schema, (2) wire it into the Bash tool, (3) add tests and documentation.

## Phase 1: Config Schema and Variable Expansion

### Overview
Add the `env` field to the config schema and implement `$VAR`/`${VAR}` expansion.

### Changes Required:

#### 1. Variable expansion utility
**File**: `source/utils/env-expand.ts` (new)
**Changes**: Create a function `expandEnvVars(vars: Record<string, string>): Record<string, string>` that:
- Iterates over each value
- Replaces `${VAR_NAME}` and `$VAR_NAME` patterns with `process.env[VAR_NAME] ?? ""`
- Uses a regex like `/\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g`
- Returns a new record with expanded values

#### 2. Config schema update
**File**: `source/config.ts`
**Changes**:
- Add `env` field to `ProjectConfigSchema`: `env: z.record(z.string(), z.string()).optional().default({})`
- Add `env` to `defaultConfig`: `env: {} as Record<string, string>`
- Update `getConfig()` merge logic to deep-merge `env` (per-key, project overrides global)

### Success Criteria:

#### Automated Verification:
- [x] Typecheck passes: `npm run typecheck`
- [x] Lint passes: `npm run lint`
- [x] Build succeeds: `npm run build`

#### Manual Verification:
- [x] N/A for this phase

---

## Phase 2: Wire Config Env Vars into Bash Tool

### Overview
Pass the resolved env vars from config into the `ExecutionEnvironment`.

### Changes Required:

#### 1. Thread config into Bash tool creation
**File**: `source/tools/bash.ts`
**Changes**:
- Accept config (or just the `env` record) in `createBashTool` options
- Merge config env vars with existing hardcoded env vars (hardcoded vars like `TICKETS_DIR` take precedence)
- Apply `expandEnvVars()` to the config env vars before passing to `initExecutionEnvironment`

#### 2. Pass config env from call site
**File**: Wherever `createBashTool` is called
**Changes**: Pass the `env` from the loaded config into `createBashTool`

### Success Criteria:

#### Automated Verification:
- [x] Typecheck passes: `npm run typecheck`
- [x] Lint passes: `npm run lint`
- [x] Build succeeds: `npm run build`

#### Manual Verification:
- [x] Add `"env": { "TEST_VAR": "hello" }` to `.acai/acai.json`, run acai, execute `echo $TEST_VAR` in Bash tool, see `hello`
- [x] Add `"env": { "EXPANDED": "$HOME" }` and verify it expands to the actual home directory
- [x] Verify undefined `$REFS` resolve to empty string

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 3: Tests and Documentation

### Overview
Add unit tests for expansion and config merging, update docs.

### Changes Required:

#### 1. Unit tests for env expansion
**File**: `test/env-expand.test.ts` (new)
**Changes**:
- Test literal passthrough
- Test `$VAR` expansion
- Test `${VAR}` expansion
- Test undefined var resolves to empty string
- Test mixed literal and variable values
- Test no expansion of `$$`, `\$`, or partial patterns

#### 2. Config tests for env merging
**File**: `test/config.test.ts`
**Changes**:
- Test that `env` field is parsed from config
- Test deep merge: global `env` + project `env` with project winning per-key

#### 3. Documentation
**File**: `docs/configuration.md`
**Changes**:
- Add section documenting the `env` config field
- Show examples of literal and variable-expanded values
- Add warning about not storing sensitive values directly — use `$VAR` references instead

#### 4. Update ARCHITECTURE.md
**File**: `ARCHITECTURE.md`
**Changes**: Add `source/utils/env-expand.ts` to the file listing

### Success Criteria:

#### Automated Verification:
- [x] All tests pass: `npm test`
- [x] Typecheck passes: `npm run typecheck`
- [x] Lint passes: `npm run lint`
- [x] Build succeeds: `npm run build`
- [x] Full check: `npm run check`

#### Manual Verification:
- [x] Documentation reads clearly and examples are correct

---

## Testing Strategy

### Unit Tests:
- `expandEnvVars` with various input patterns
- Config schema validation accepts/rejects `env` field correctly
- Deep merge of `env` across global and project configs

### Manual Testing Steps:
1. Add `"env": { "FOO": "bar", "SECRET": "$SOME_SHELL_VAR" }` to `.acai/acai.json`
2. Export `SOME_SHELL_VAR=mysecret` in shell
3. Run acai, use Bash tool to `echo $FOO` → expect `bar`
4. Use Bash tool to `echo $SECRET` → expect `mysecret`

## Performance Considerations

Env expansion runs once at config load time — negligible cost. No runtime overhead per command execution.

## Migration Notes

Existing configs without `env` will default to `{}` — fully backwards compatible.

## References

- GitHub issue: https://github.com/travisennis/acai-ts/issues/117
- Config schema: `source/config.ts#L25-L56`
- ExecutionEnvironment constructor: `source/execution/index.ts#L189-L204`
- Bash tool creation: `source/tools/bash.ts#L265-L276`
