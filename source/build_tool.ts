import { exec } from "node:child_process";
import { CallableTool, type ToolParameters } from "./tools";

export class BuildTool extends CallableTool {
  getName(): string {
    return "build";
  }

  getDescription(): string {
    return "Executes the build command for the project and returns the output.";
  }

  getParameters(): ToolParameters {
    return {
      type: "object",
      requiredProperties: {},
      optionalProperties: {
        command: {
          type: "string",
          description:
            "Optional custom build command. If not provided, the default build command will be used.",
        },
      },
    };
  }

  async call(args: { [key: string]: string }): Promise<string> {
    const buildCommand = args.command || "npm run build";
    return new Promise((resolve, reject) => {
      exec(buildCommand, (error, stdout, stderr) => {
        if (error) {
          reject(`Build execution error: ${error.message}`);
          return;
        }
        if (stderr) {
          console.error(`Build stderr: ${stderr}`);
        }
        resolve(stdout);
      });
    });
  }
}
