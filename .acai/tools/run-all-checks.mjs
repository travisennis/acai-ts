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
      // Write all output to temp file
      writeFileSync(tmpFile, output);
      
      if (code === 0) {
        // Success - just show success message
        console.log('success - all checks pass');
        unlinkSync(tmpFile);
        process.exit(0);
      } else {
        // Failure - show full output
        const fullOutput = readFileSync(tmpFile, 'utf8');
        console.log(fullOutput);
        unlinkSync(tmpFile);
        process.exit(code);
      }
    });
  });
}
