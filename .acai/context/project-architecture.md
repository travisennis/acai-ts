---
name: "Project Architecture"
description: "Overview of acai-ts architecture and key components"
---
# acai-ts Architecture

## Core Components

1. **Agent System**: Main AI agent with tool execution
2. **Model Providers**: Abstraction for multiple AI APIs (OpenRouter, Anthropic, etc.)
3. **Tool System**: Modular tools for file operations, bash, web search, etc.
4. **Skills System**: Extensible skill system for task-specific instructions
5. **Context System**: Background information for subtasks (this feature!)

## Key Directories

- `source/`: Main TypeScript source code
- `source/tools/`: Tool implementations
- `source/models/`: Model provider implementations
- `source/commands/`: CLI command implementations
- `.acai/`: Configuration and user data
  - `.acai/skills/`: Skill files
  - `.acai/context/`: Context files (new!)

## Design Patterns

- Uses ES Modules with `.ts` extensions
- Follows Biome formatting rules
- TypeScript strict mode enabled
- Error handling with try/catch patterns
- Configuration via `acai.json` files