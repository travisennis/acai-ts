# Subagent Tool Implementation Plan

## Overview

Implement subagent functionality in the existing `source/tools/agent.ts` tool. Subagents are defined by markdown files with YAML frontmatter in `.acai/subagents/` (similar to skills).

## Goals

- Allow the main agent to delegate specialized tasks to purpose-built subagents
- Subagents defined as markdown files with YAML frontmatter (similar to skills)
- Support model override, tool restrictions, and custom timeouts per subagent
- Enable recursive subagent calls

## Subagent File Format

Location: `.acai/subagents/{name}.md` or `~/.acai/subagents/{name}.md`

```yaml
---
name: code-reviewer
description: Reviews code for quality, security, and best practices
model: anthropic:sonnet        # optional, overrides parent model
tools: Read, Grep, Glob, Bash  # optional, comma-separated tool names
timeout: 600                   # optional, seconds (default: 300)
---

You are a code review specialist. Analyze the provided code for:
- Code quality and maintainability
- Security vulnerabilities
- Performance issues
- Best practices violations

{{task}}

Provide a structured review with severity levels.
```

### Frontmatter Fields

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | yes | - | Identifier matching filename (without `.md`) |
| `description` | yes | - | Shown to parent agent for subagent selection |
| `model` | no | parent's model | Override model (e.g., `openai:gpt-4o`) |
| `tools` | no | all tools | Comma-separated list of allowed tools |
| `timeout` | no | 300 | Max execution time in seconds |

### Task Injection

- If `{{task}}` placeholder exists in the body → replace it with the task
- Otherwise → append task after the content

## Available Tool Names

For the `tools` frontmatter field, use these user-friendly names:

`Read`, `Edit`, `Write`, `Bash`, `Grep`, `Glob`, `LS`, `DirectoryTree`, `Think`, `Skill`, `Agent`, `Subagent`

## Implementation Phases

### Phase 1: Create Subagent Loader

**File:** `source/subagents.ts`

Create a new module (modeled after `source/skills.ts`) with:

```typescript
interface SubagentFrontmatter {
  name: string;
  description: string;
  model?: string;
  tools?: string;
  timeout?: number;
}

interface Subagent {
  name: string;
  description: string;
  model?: string;
  tools?: string[];
  timeout: number;
  systemPrompt: string;
  filePath: string;
  source: string;
}

// Load all subagent definitions from project and user directories
export async function loadSubagents(): Promise<Subagent[]>;

// Get a specific subagent by name
export async function getSubagent(name: string): Promise<Subagent | undefined>;

// Format subagents list for tool description
export function formatSubagentsForDescription(subagents: Subagent[]): string;
```

Key implementation details:
- Search `.acai/subagents/` (project) and `~/.acai/subagents/` (user)
- Project subagents override user subagents with same name
- Parse YAML frontmatter using existing `parseFrontMatter` utility
- Validate name matches filename (without `.md`)
- Handle `{{task}}` placeholder in body

### Phase 2: Update Agent Tool

**File:** `source/tools/agent.ts`

Update the existing tool:

1. **Update `inputSchema`:**
```typescript
const inputSchema = z.object({
  prompt: z.string().describe("The task for the agent to perform"),
  type: z.string().describe("The subagent type to use (matches subagent name)"),
  timeout: z.number().optional().describe("Override default timeout in seconds"),
});
```

2. **Update `getToolDescription()`:**
```typescript
async function getToolDescription(): Promise<string> {
  const subagents = await loadSubagents();
  const subagentList = formatSubagentsForDescription(subagents);
  
  return `Launch a new agent to handle complex, multi-step tasks autonomously.
...
Available agent types:
${subagentList}
...`;
}
```

3. **Implement `loadSubAgentionDefitions()`:**
```typescript
async function loadSubAgentDefinition(type: string): Promise<{
  model: string;
  system: string;
  tools?: string[];
  timeout: number;
}> {
  const subagent = await getSubagent(type);
  if (!subagent) {
    const available = await loadSubagents();
    const names = available.map(s => s.name).join(", ");
    throw new Error(`Unknown subagent type: "${type}". Available: ${names}`);
  }
  return {
    model: subagent.model ?? "",
    system: subagent.systemPrompt,
    tools: subagent.tools,
    timeout: subagent.timeout,
  };
}
```

4. **Update `execute()` function:**
- Call async `loadSubAgentDefinition(type)`
- Inject task into system prompt (replace `{{task}}` or append)
- Pass tools filter to SubAgent if specified
- Respect timeout setting

### Phase 3: Update SubAgent Class

**File:** `source/agent/sub-agent.ts`

Add support for:
- Tool filtering (accept allowed tools list)
- Configurable timeout

```typescript
interface SubAgentExecuteOptions {
  model: SupportedModel;
  system: string;
  prompt: string;
  abortSignal?: AbortSignal;
  allowedTools?: string[];  // New: filter available tools
  timeout?: number;         // New: execution timeout in seconds
}
```

### Phase 4: Create Example Subagents

**Directory:** `.acai/subagents/`

Create example files:
- `code-reviewer.md` - Code review specialist
- `test-writer.md` - Test generation specialist  
- `researcher.md` - Web research specialist

### Phase 5: Update Documentation

**File:** `ARCHITECTURE.md`

Add documentation for:
- `.acai/subagents/` directory structure
- Subagent file format and frontmatter fields
- How subagents are loaded and used

## Directory Structure

```
.acai/
├── subagents/
│   ├── code-reviewer.md
│   ├── test-writer.md
│   └── researcher.md
├── skills/
│   └── ...
└── tools/
    └── ...
```

## Error Handling

- If subagent type doesn't exist → list available subagents and return error
- If frontmatter is invalid → return validation error with details
- If timeout exceeded → abort execution and return timeout error
- If model invalid → fall back to default model

## Future Considerations

- Subagent chaining/orchestration
- Shared context between parent and subagent
- Subagent result caching
- Parallel subagent execution
- Tool allowlist validation against available tools
