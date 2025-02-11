import chalk, { type ChalkInstance } from "chalk";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";

marked.setOptions({
  // Define custom renderer
  renderer: new TerminalRenderer() as any,
});

export async function writeMd(input: string): Promise<void> {
  const md = await marked.parse(input);
  writeln(md);
}

export function write(input: string): void {
  process.stdout.write(input);
}

export function writeln(input: string): void {
  process.stdout.write(`${input}\n`);
}

export function writeError(input: string): void {
  process.stdout.write(chalk.red(`✖️  ${input}`));
}

export function writeHeader(
  header: string,
  chalkFn: ChalkInstance = chalk.green,
): void {
  const width = process.stdout.columns - header.length - 2;
  process.stdout.write(chalkFn(`\n--${header}${"-".repeat(width)}\n`));
}

export function writehr(chalkFn: ChalkInstance = chalk.cyan): void {
  process.stdout.write(chalkFn(`\n${"-".repeat(process.stdout.columns)}\n`));
}
