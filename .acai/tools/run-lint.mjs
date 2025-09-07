#!/usr/bin/env node

import { spawn } from 'node:child_process';

if (process.env.TOOL_ACTION === 'describe') {
  console.log(JSON.stringify({
    name: 'run-lint',
    description: 'Run lint in a project workspace',
    parameters: [
      {
        name: 'dir',
        type: 'string',
        description: 'the workspace directory to run linting in',
        required: false,
        default: '.'
      }
    ]
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
    const child = spawn('npm', ['run', 'lint'], { cwd: dir, stdio: 'pipe' });
    let output = '';
    child.stdout.on('data', (data) => output += data);
    child.on('close', (code) => {
      console.log(output);
      process.exit(code);
    });
  });
}
