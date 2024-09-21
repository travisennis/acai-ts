import { exec } from "node:child_process";
import logger from "./logger";
import chalk, { type ChalkInstance } from "chalk";

export function writeln(input: string): void {
  process.stdout.write(`${input}\n`);
}

export function writehr(chalkFn: ChalkInstance = chalk.cyan): void {
  process.stdout.write(chalkFn(`\n${"-".repeat(process.stdout.columns)}\n`));
}

export function asyncExec(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
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
  });
}
