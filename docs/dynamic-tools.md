# Dynamic Tools

Dynamic tools allow you to extend acai with custom tools. They are loaded from `.acai/tools` directories and invoked by the AI model during conversations.

## Language Support

Dynamic tools support any executable language, not just Node.js. The system detects how to run a tool based on:

1. **Shebang line** (`#!/bin/bash`, `#!/usr/bin/env python3`, etc.)
2. **File extension** (`.js`, `.mjs`, `.sh`, `.py`, `.rb`, etc.)
3. **Extensionless executables** (must have execute permission)

### Supported Extensions

| Extension | Interpreter |
|-----------|-------------|
| `.js`, `.mjs`, `.cjs` | Node.js (`process.execPath`) |
| `.sh`, `.bash` | `/bin/bash` |
| `.zsh` | `/bin/zsh` |
| `.py` | `python3` |
| `.rb` | `ruby` |

Files without an extension are also supported if they have execute permission and a valid shebang line.

## Tool Locations

Dynamic tools are loaded from (later sources override earlier ones):

1. `~/.acai/tools/` (user-level tools)
2. `<project>/.acai/tools/` (project-specific tools)

## Schema Formats

### JSON Schema (Node.js and other languages)

When a tool is spawned with `TOOL_ACTION=describe`, it must output its schema. The JSON format is the original format:

```javascript
if (process.env.TOOL_ACTION === 'describe') {
  console.log(JSON.stringify({
    name: 'tool-name',
    description: 'What the tool does',
    parameters: [
      {
        name: 'paramName',
        type: 'string' | 'number' | 'boolean',
        description: 'What this parameter does',
        required: true,    // default: true
        default: 'value'   // optional default
      }
    ],
    needsApproval: false   // default: true - requires user approval before execution
  }, null, 2));
  process.exit(0);
}
```

### Text Schema (Amp-compatible)

The text format is simpler and ideal for bash scripts. If JSON parsing of the describe output fails, the text format is tried automatically:

```
name: run_tests
description: Run the tests in the project
workspace: string optional name of the workspace directory
test: string optional test name pattern
```

Format specification:
- `name` and `description` are required
- Parameter lines: `paramName: type [optional|required] description text`
- Parameters without `optional` are required by default
- Supported types: `string`, `number`, `boolean`
- Empty lines and lines starting with `#` or `//` are comments
- Tool name must match `/^[a-zA-Z_][a-zA-Z0-9_-]*$/`

## Execution

### JSON Format Execution

When the model calls your tool, it runs with `TOOL_ACTION=execute` and parameters passed as JSON via stdin:

```javascript
if (process.env.TOOL_ACTION === 'execute') {
  let params = [];
  process.stdin.setEncoding('utf8');
  
  process.stdin.on('readable', () => {
    let chunk;
    while (null !== (chunk = process.stdin.read())) {
      params = JSON.parse(chunk);
    }
  });

  process.stdin.on('end', () => {
    // params is an array: [{ name: 'paramName', value: 'actualValue' }, ...]
    const myParam = params.find(p => p.name === 'paramName')?.value;
    
    // Do work...
    console.log('Output result');
    process.exit(0);
  });
}
```

### Text Format Execution (Key-Value)

Tools using the text schema format receive parameters as key-value pairs on stdin:

```
param1=value1
param2=value2
```

Example bash script:

```bash
#!/bin/bash

action="${TOOL_ACTION}"

if [ "$action" = "describe" ]; then
  cat << 'EOF'
name: my_tool
description: My bash tool
param1: string optional a parameter
EOF
  exit 0
fi

if [ "$action" = "execute" ]; then
  while IFS='=' read -r key value; do
    declare "$key"="$value"
  done
  echo "Got param1=$param1"
  exit 0
fi
```

## .tool Companion Files

A `.tool` file contains only the text schema definition. The corresponding executable is a file with the same name but without the `.tool` extension in the same directory.

For example:
- `.acai/tools/run_tests.tool` - text schema definition
- `.acai/tools/run_tests` - the executable bash script

When a `.tool` file is found:
1. The `.tool` file is read and parsed as text schema
2. A companion executable (same name without `.tool`) is looked for
3. The companion is used for execution

This is useful when you want to separate the schema definition from the executable script.

## Session Context

Dynamic tools receive session context via environment variables during both describe and execute actions:

| Variable | Value | Description |
|----------|-------|-------------|
| `ACAI_SESSION_ID` | Current session UUID | Identifies the current session |
| `ACAI_PROJECT_DIR` | Primary workspace directory | The project root directory |
| `ACAI_AGENT_NAME` | Agent name (e.g., "repl") | The agent running the tool |

Example usage in bash:

```bash
#!/bin/bash
if [ "$TOOL_ACTION" = "execute" ]; then
  echo "Running in project: $ACAI_PROJECT_DIR"
  echo "Session: $ACAI_SESSION_ID"
fi
```

## Scaffolding Tools with `/tools make`

Use the `/tools make` command in the REPL to scaffold new dynamic tools:

```
/tools make my_tool --bash --description "My bash tool"
/tools make my_tool --node --description "My Node.js tool"
/tools make my_tool --zsh --description "My zsh tool"
/tools make my_tool --text --description "My tool with text schema"
```

Options:
- `--bash` - Create a bash script template (default)
- `--zsh` - Create a zsh script template
- `--node` - Create a Node.js script template
- `--text` - Create a `.tool` schema file with a bash companion script
- `--description <desc>` or `-d <desc>` - Tool description
- `--dir <path>` - Custom output directory (default: `.acai/tools`)

List existing dynamic tools:

```
/tools list
```

## Example: Bash Tool

```bash
#!/bin/bash

action="${TOOL_ACTION}"

if [ "$action" = "describe" ]; then
  cat << 'EOF'
name: run-all-checks
description: Run all checks in the project
dir: string optional the workspace directory
EOF
  exit 0
fi

if [ "$action" = "execute" ]; then
  while IFS='=' read -r key value; do
    declare "$key"="$value"
  done
  cd "${ACAI_PROJECT_DIR:-${dir:-.}}"
  npm run typecheck && npm run lint:fix && npm run format
  exit 0
fi
```

## Example: Node.js Tool

```javascript
#!/usr/bin/env node

const TOOL_ACTION = process.env.TOOL_ACTION;

if (TOOL_ACTION === 'describe') {
  console.log(JSON.stringify({
    name: 'run-all-checks',
    description: 'Run all checks in the project',
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

if (TOOL_ACTION === 'execute') {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { data += chunk; });
  process.stdin.on('end', () => {
    const params = JSON.parse(data);
    const dir = params.find(p => p.name === 'dir')?.value || '.';
    // Your tool logic here
    console.log('All checks passed');
    process.exit(0);
  });
}
```

## Configuration

Dynamic tools can be configured in your project or user config:

```json
{
  "tools": {
    "dynamicTools": {
      "enabled": true,
      "maxTools": 10
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|--------------|
| `enabled` | boolean | `true` | Enable/disable dynamic tools |
| `maxTools` | number | `10` | Maximum number of dynamic tools to load |

## Tool Naming

Tools are registered with the exact name specified in the `name` field of the describe output. There is no prefix added.

Parameter names must match `/^[a-zA-Z_][a-zA-Z0-9_-]*$/`.

## Behavior

### Conflict Handling

Dynamic tools with the same name as existing built-in tools are skipped silently. Avoid naming your tools `Bash`, `Read`, `Write`, `Grep`, or other built-in tool names.

### Duplicate Names

If multiple files define tools with the same name, only the first one encountered is loaded.

### maxTools Limit

When the total number of discovered tools exceeds `maxTools`, project tools take priority over user tools. The most recently discovered tools (project tools) are kept up to the limit.

### Execution Environment

When your tool executes:
- `NODE_ENV` is set to `production`
- `ACAI_SESSION_ID`, `ACAI_PROJECT_DIR`, and `ACAI_AGENT_NAME` are set
- The working directory is set to the directory containing your tool script
- Output exceeding 2MB is truncated with `[Output truncated]`
- A 30-second timeout applies by default

## Best Practices

1. **Keep tools focused**: Each tool should do one thing well
2. **Set appropriate timeouts**: Default timeout is 30 seconds
3. **Handle errors gracefully**: Always exit with appropriate codes and output
4. **Use `needsApproval: false` sparingly**: Only for safe, read-only operations
5. **Output format**: Return plain text or JSON (will be parsed if valid JSON)
6. **Use text schema for bash tools**: Simpler than JSON for shell scripts
7. **Use shebangs**: Always include a shebang line for non-Node.js scripts