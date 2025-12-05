#!/usr/bin/env node --experimental-vm-modules

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the main entry point
const mainScript = resolve(__dirname, '../dist/index.js');

// Spawn the main script with the same arguments
const child = spawn(process.execPath, ['--experimental-vm-modules', mainScript, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

child.on('error', (err) => {
  console.error('Failed to start subprocess:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});