import { exec } from "node:child_process";

export function asyncExec(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(`Command ${command} execution error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`Command ${command} stderr: ${stderr}`);
      }
      resolve(stdout);
    });
  });
}
