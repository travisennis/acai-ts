import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CHECKS = [
  {
    name: 'Node.js ≥24',
    cmd: 'node -v',
    validate: (v: string) => {
      const version = parseInt(v.slice(1));
      if (version < 24) {
        throw new Error(`Node.js ${version} is below minimum version 24`);
      }
      return true;
    },
  },
  { name: 'npm', cmd: 'npm -v', validate: () => true },
  { name: 'Git', cmd: 'git --version', validate: () => true },
  { name: 'Ripgrep', cmd: 'rg --version', validate: () => true },
];

const ACAI_DIRS = ['sessions', 'rules', 'logs'];

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch (error) {
    const e = error as { status?: number; message?: string };
    throw new Error(e.message ?? `Command failed: ${cmd}`);
  }
}

function check(name: string, cmd: string, validate: (output: string) => boolean): void {
  try {
    const output = run(cmd);
    const ok = validate(output);
    console.info(`  ${ok ? '✓' : '⚠'} ${name}: ${output.split('\n')[0]}`);
  } catch {
    console.info(`  ✗ ${name}: not found`);
  }
}

console.info('Checking prerequisites...\n');

for (const { name, cmd, validate } of CHECKS) {
  check(name, cmd, validate);
}

const acaiDir = join(homedir(), '.acai');
console.info('\nSetting up ~/.acai directory...\n');

for (const dir of ACAI_DIRS) {
  const path = join(acaiDir, dir);
  if (existsSync(path)) {
    console.info(`  ✓ ${dir}/ already exists`);
  } else {
    mkdirSync(path, { recursive: true });
    console.info(`  + created ${dir}/`);
  }
}

console.info('\nInstalling dependencies...\n');

run('npm install');

console.info('\n✓ Setup complete. Run `npm run dev` to start the REPL.');
