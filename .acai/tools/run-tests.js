#!/usr/bin/env node

import { spawn } from 'node:child_process';

if (process.env.TOOL_ACTION === 'describe') {
  console.log(JSON.stringify({
    name: 'run-tests',
    description: 'Run tests in the specified directory',
    parameters: [
      {
        name: 'dir',
        type: 'string',
        description: 'Directory to run tests in (default: current directory)',
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

  process.stdin.on('end', async () => {
    const dirParam = params.find(p => p.name === 'dir')?.value || '.';
    
    try {
      const child = spawn('npm', ['test'], {
        cwd: dirParam,
        stdio: 'pipe'
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          console.error(`Test run failed with code ${code}: ${stderr}`);
          process.exit(code);
        } else {
          console.log(stdout);
          process.exit(0);
        }
      });
    } catch (error) {
      console.error('Failed to run tests:', error);
      process.exit(1);
    }
  });
}