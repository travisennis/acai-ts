# CodeSearch Tool Implementation Plan

## Summary

Create a new `CodeSearch` tool that uses colgrep (semantic code search) to provide natural-language-powered code search capabilities. This tool complements the existing Grep tool by enabling semantic search—finding code by meaning rather than just pattern matching.

## Changes

### 1. New Tool: `source/tools/code-search.ts`

Create a new tool file following the Grep tool structure with:

- **Tool definition**: `CodeSearchTool` constant and `createCodeSearchTool()` function
- **Input schema** (Zod):
  - `query`: string (required) - Natural language query for semantic search
  - `path`: string (optional, default: ".") - Path to search in
  - `regexPattern`: string (optional) - Regex pre-filter (`-e` flag)
  - `filePattern`: string (optional) - File filter (`--include` flag)
  - `excludePattern`: string (optional) - Exclude pattern (`--exclude` flag)
  - `excludeDir`: string (optional) - Exclude directories (`--exclude-dir` flag)
  - `maxResults`: number (optional, default: 15) - Number of results (`-k` flag)
  - `contextLines`: number (optional, default: 6) - Context lines (`-n` flag)
  - `filesOnly`: boolean (optional) - List only files (`-l` flag)
  - `showContent`: boolean (optional) - Show full content (`-c` flag)
  - `codeOnly`: boolean (optional) - Skip config/text files (`--code-only` flag)

- **Execute function**: Calls `colgrep` with appropriate flags and parses output
- **Display function**: Shows search query and parameters

### 2. Tool Registration: `source/tools/index.ts`

- Add import: `import { createCodeSearchTool, CodeSearchTool } from "./code-search.ts";`
- Add tool creation: `const codeSearchTool = createCodeSearchTool();`
- Add to tools object: `[CodeSearchTool.name]: codeSearchTool,`

### 3. Health Check: `source/commands/health/utils.ts`

Add colgrep to the `BASH_TOOLS` array:

```typescript
{ name: "colgrep", command: "colgrep --version" }
```

This ensures the `/health` command reports on colgrep's presence.

### 4. Documentation Updates

- **ARCHITECTURE.md**: Add entry for `source/tools/code-search.ts`
- **README.md**: If tool list exists, add CodeSearch entry

## Technical Details

### Execution Strategy

The tool will use `execSync` to call colgrep with appropriate arguments:

```typescript
const args = [
  query,
  ...(path !== "." ? [path] : []),
  ...(regexPattern ? ["-e", regexPattern] : []),
  ...(filePattern ? ["--include", filePattern] : []),
  ...(excludePattern ? ["--exclude", excludePattern] : []),
  ...(excludeDir ? ["--exclude-dir", excludeDir] : []),
  ...(maxResults !== undefined ? ["-k", String(maxResults)] : []),
  ...(contextLines !== undefined ? ["-n", String(contextLines)] : []),
  ...(filesOnly ? ["-l"] : []),
  ...(showContent ? ["-c"] : []),
  ...(codeOnly ? ["--code-only"] : []),
];
```

### Error Handling

- **Tool not installed**: Catch execSync error and provide user-friendly message suggesting installation
- **Path not found**: Check and provide clear error
- **Index not built**: colgrep auto-indexes; handle gracefully
- **Search timeout**: Add reasonable timeout (30 seconds)

### Tool Description

```
Search code semantically using colgrep (AI-powered semantic code search).
Use natural language queries like "function that handles user authentication"
to find relevant code even when keywords don't match exactly.
Supports hybrid search: combine regex filtering with semantic ranking.
Requires colgrep to be installed (see: https://github.com/lightonai/next-plaid)
```

## Out of Scope

- Model/embedding configuration options (advanced, rarely needed)
- Index management subcommands (init, status, clear) - users can use colgrep directly
- Integration with Claude Code's colgrep plugin features

## Success Criteria

### Automated Verification

- [x] `npm run typecheck` - No type errors
- [x] `npm run lint` - No linting errors
- [x] `npm run build` - Successful build
- [x] Tool file exists at `source/tools/code-search.ts`
- [x] Tool is registered in `source/tools/index.ts`
- [x] colgrep entry exists in `BASH_TOOLS` in `source/commands/health/utils.ts`

### Manual Verification

- `/health` command shows colgrep as installed/not installed
- CodeSearch tool appears in available tools list
- Running a semantic search like `"file reading functionality"` returns relevant results
- Running with regex filter like `-e "async.*"` combined with semantic query works

## Assumptions

- colgrep version check command `colgrep --version` works as expected (verified: returns `colgrep 1.0.7`)
- Default colgrep behavior (auto-index) is acceptable for first-time searches
- Human-readable output format is preferred over JSON for LLM consumption
