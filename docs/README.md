# Documentation

Quick reference for developing and extending acai-ts.

## Getting Started

- [Installation & Setup](../CONTRIBUTING.md#setup) - Local development environment
- [Usage Guide](usage.md) - Commands, keyboard shortcuts, prompt syntax
- [Project Structure](../ARCHITECTURE.md) - Source code organization and flow diagrams

## Configuration

- [Configuration Reference](configuration.md) - Environment variables, `acai.json`, project settings
- [Dynamic Tools](dynamic-tools.md) - Creating custom tools in `.acai/tools/`

## Extensibility

- [Skills System](skills.md) - Creating specialized instruction files for reusable workflows
- [Dynamic Tools](dynamic-tools.md) - Creating custom tools to extend acai's capabilities

## Development

- [AGENTS.md](../AGENTS.md) - Project-specific rules for AI assistants working in this repo
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Development setup, scripts, and code style
- [Architecture Overview](../ARCHITECTURE.md) - Internal architecture, modules, and flow diagrams

## API Reference

### Source Modules

| Module | Purpose |
|--------|---------|
| `source/agent/` | Agent loop and sub-agent execution |
| `source/commands/` | REPL command implementations |
| `source/models/` | AI model providers and management |
| `source/tools/` | AI-callable tools (Bash, Read, Edit, Search, Web) |
| `source/tui/` | Terminal user interface components |
| `source/skills/` | Skills discovery and loading |
| `source/sessions/` | Session persistence and management |
