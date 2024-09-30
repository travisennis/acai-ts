import { exec } from "node:child_process";
import chalk, { type ChalkInstance } from "chalk";
import logger from "./logger.js";

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

export function asyncExec(command: string): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  exec(command, (error, stdout, stderr) => {
    if (error) {
      reject(`Command ${command} execution error: ${error.message}`);
      return;
    }
    if (stderr) {
      logger.error(`Command ${command} stderr: ${stderr}`);
    }
    resolve(stdout);
  });
  return promise;
}
