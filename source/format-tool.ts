import { exec } from "node:child_process";
import { CallableTool, type ToolParameters } from "./tools";

export class FormatTool extends CallableTool {
  getName(): string {
    return "format";
  }

  getDescription(): string {
    return 'Executes the "biome format" command on a specified file or directory and returns the result.';
  }

  getParameters(): ToolParameters {
    return {
      type: "object",
      requiredProperties: {
        target: {
          type: "string",
          description: "The file or directory to format.",
        },
      },
      optionalProperties: {},
    };
  }

  async call(args: { [key: string]: string }): Promise<string> {
    const { target } = args;
    const command = `biome format ${target}`;

    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(`Format execution error: ${error.message}`);
          return;
        }
        if (stderr) {
          console.error(`Format stderr: ${stderr}`);
        }
        resolve(stdout);
      });
    });
  }
}
