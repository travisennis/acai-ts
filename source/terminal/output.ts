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
  process.stdout.write(chalk.red(`✖️  ${input}\n`));
}

export function writeHeader(
  header: string,
  chalkFn: ChalkInstance = chalk.green,
): void {
  const width = process.stdout.columns - header.length - 2;
  process.stdout.write(chalkFn(`\n──${header}${"─".repeat(width)}\n`));
}

export function writeBox(
  header: string,
  content: string,
  chalkFn: ChalkInstance = chalk.green,
): void {
  const width = process.stdout.columns - 4; // Account for box borders
  const paddedHeader = ` ${header} `;
  const headerStartPos = Math.floor((width - paddedHeader.length) / 2);

  // Top border with header
  const topBorder = `┌${"─".repeat(headerStartPos)}${paddedHeader}${"─".repeat(width - headerStartPos - paddedHeader.length)}┐`;

  // Content lines with side borders
  const contentLines = content
    .split("\n")
    .map((line) => {
      return `│ ${line.padEnd(width - 2)} │`;
    })
    .join("\n");

  // Bottom border
  const bottomBorder = `└${"─".repeat(width)}┘`;

  // Write the box
  process.stdout.write(
    chalkFn(`\n${topBorder}\n${contentLines}\n${bottomBorder}\n`),
  );
}

export function writehr(chalkFn: ChalkInstance = chalk.cyan): void {
  process.stdout.write(chalkFn(`\n${"-".repeat(process.stdout.columns)}\n`));
}
