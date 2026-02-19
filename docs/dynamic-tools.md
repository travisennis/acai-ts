# Dynamic Tools

Dynamic tools allow you to extend acai with custom tools written as Node.js scripts. They are loaded from `.acai/tools` directories and invoked by the AI model during conversations.

## How Dynamic Tools Work

1. **Discovery**: At startup, acai scans `.acai/tools` directories for `.js` and `.mjs` files
2. **Metadata**: Each tool must respond to `TOOL_ACTION=describe` with its schema
3. **Execution**: Tools are invoked via `TOOL_ACTION=execute` with parameters passed via stdin

## Tool Locations

Dynamic tools are loaded from (later sources override earlier ones):

1. `~/.acai/tools/` (user-level tools)
2. `<project>/.acai/tools/` (project-specific tools)

## Writing a Dynamic Tool

A dynamic tool is a Node.js script that handles two actions:

### 1. Describe Action (`TOOL_ACTION=describe`)

When acai loads your tool, it spawns the script with `TOOL_ACTION=describe`. Your script must output JSON metadata:

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

### 2. Execute Action (`TOOL_ACTION=execute`)

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

## Example Tool

Here's a complete example from `.acai/tools/run-all-checks.mjs`:

```javascript
#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';

if (process.env.TOOL_ACTION === 'describe') {
  console.log(JSON.stringify({
    name: 'run-all-checks',
    description: 'Run all checks in a project workspace (typecheck, lint:fix, format)',
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
    const dir = params.find(p => p.name === 'dir')?.value || '.';
    const tmpFile = join(tmpdir(), `acai-checks-${Date.now()}.txt`);
    
    const child = spawn('npm run typecheck && npm run lint:fix && npm run format', [], {
      cwd: dir, 
      stdio: 'pipe',
      shell: true
    });
    
    let output = '';
    child.stdout.on('data', (data) => output += data);
    child.stderr.on('data', (data) => output += data);
    
    child.on('close', (code) => {
      writeFileSync(tmpFile, output);
      
      if (code === 0) {
        console.log('success - all checks pass');
        unlinkSync(tmpFile);
        process.exit(0);
      } else {
        const fullOutput = readFileSync(tmpFile, 'utf8');
        console.log(fullOutput);
        unlinkSync(tmpFile);
        process.exit(code);
      }
    });
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

Tool names are prefixed with `dynamic-` when registered. A tool named `my-tool` becomes `dynamic-my-tool` in acai.

Parameter names must match `/^[a-zA-Z_][a-zA-Z0-9_-]*$/`.

## Best Practices

1. **Keep tools focused**: Each tool should do one thing well
2. **Set appropriate timeouts**: Default timeout is 30 seconds
3. **Handle errors gracefully**: Always exit with appropriate codes and output
4. **Use `needsApproval: false` sparingly**: Only for safe, read-only operations
5. **Output format**: Return plain text or JSON (will be parsed if valid JSON)
