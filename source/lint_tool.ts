import child_process from "node:child_process";
import { CallableTool, type ToolParameters } from "./tools";

export class LintTool extends CallableTool {
  getName(): string {
    return "lint_code";
  }
  getDescription(): string {
    return "Lints the provided code base using a specified command and returns the results. This function helps identify and report potential issues, style violations, or errors in the code, improving code quality and consistency.";
  }
  getParameters(): ToolParameters {
    return {
      type: "object",
      requiredProperties: {
        fileName: {
          type: "string",
          description: "The path of the file to lint.",
        },
      },
    };
  }
  async call(args: { [key: string]: string }): Promise<string> {
    const file = args.fileName;
    const executeCommand = (file: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        child_process.exec(`biome check ${file}`, (error, stdout) => {
          if (error) {
            reject(error);
          } else {
            resolve(stdout.toString());
          }
        });
      });
    };

    const result = await executeCommand(file);
    console.log(file, result);
    return result;
  }
}
