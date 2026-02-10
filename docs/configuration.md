# Configuration

## Environment Variables

Acai supports various AI providers through environment variables. Create a `.env` file in your project root or set these variables in your shell environment.

### AI Provider API Keys

```bash
# OpenAI (GPT models)
OPENAI_API_KEY=your_openai_api_key_here

# Anthropic (Claude models)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Google (Gemini models)
GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key_here

# DeepSeek
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# Groq
GROQ_API_KEY=your_groq_api_key_here

# X.AI (Grok models)
X_AI_API_KEY=your_xai_api_key_here

# OpenRouter (access to multiple models)
OPENROUTER_API_KEY=your_openrouter_api_key_here

# OpenCode Zen
OPENCODE_ZEN_API_TOKEN=your_opencode_zen_api_token_here

# Exa API (for web search)
EXA_API_KEY=your_exa_api_key_here
```

### Application Configuration

```bash
# Logging level (optional, defaults to "debug")
# Options: trace, debug, info, warn, error, fatal
LOG_LEVEL=info
```

### Example .env File

```bash
# Core AI providers (at least one recommended)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Optional: Additional providers
GOOGLE_GENERATIVE_AI_API_KEY=...
GROQ_API_KEY=...
OPENROUTER_API_KEY=sk-or-...

# Optional: Application settings
LOG_LEVEL=info
```

You need at least one AI provider API key to use Acai.

## Project Configuration

Acai supports project-specific configuration through a `.acai/acai.json` file in your project directory:

```json
{
  "logs": {
    "path": "~/.acai/logs/acai.log"
  },
  "notify": true,
  "tools": {
    "maxTokens": 30000
  },
  "skills": {
    "enabled": true
  }
}
```

### Custom Environment Variables

You can define environment variables in `acai.json` that are passed to the Bash tool's execution environment. Values support `$VAR` and `${VAR}` expansion against your shell environment, so you can reference secrets without committing them to config.

```json
{
  "env": {
    "DATABASE_URL": "postgres://localhost:5432/mydb",
    "API_KEY": "$MY_SECRET_API_KEY",
    "CUSTOM_PATH": "${HOME}/tools/bin"
  }
}
```

- **Literal values** are passed through as-is
- **`$VAR`** and **`${VAR}`** references are expanded against your shell environment at config load time
- Undefined references resolve to empty string
- Project-level env vars override global-level env vars (per-key)

> **Warning:** Do not store sensitive values directly in `acai.json`. Use `$VAR` references to secrets defined in your shell environment instead.

### Project-Specific Customization

- **Rules/Guidelines**: Add project-specific AI behavior rules in `AGENTS.md`
- **Custom Skills**: Store reusable skill prompts in `.agents/skills/<name>/SKILL.md`. Skills with `user-invocable: true` are registered as slash commands with argument placeholder support (`$ARGUMENTS`, `$1`, `$2`, etc.).
- **File Selections**: Save file/directory selections in `.acai/selections/`
- **Memory/Rules**: Persistent project rules stored in `.acai/rules/`

## Global Configuration

Global application settings are stored in:
- **Configuration**: `~/.acai/`
- **Logs**: `~/.acai/logs/acai.log`
- **Sessions**: `~/.acai/sessions/`
