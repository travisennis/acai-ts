import style from "../../terminal/style.ts";
import { getPackageVersion } from "../../version.ts";
import type { Component } from "../tui.ts";

export class Welcome implements Component {
  render(_width: number): string[] {
    const version = getPackageVersion();
    const result: string[] = [];
    result.push(style.magenta(this.getLogo()));
    result.push("");
    result.push(style.magenta("Greetings! I am acai."));
    result.push(style.gray(`  Version ${version}`));
    result.push("");

    result.push(
      style.white(`  Type ${style.cyan("/help")} to see available commands.`),
    );
    result.push(
      style.white(
        "  You can ask acai to explain code, fix issues, or perform tasks.",
      ),
    );
    result.push(
      style.white(
        `  Example: "${style.italic("Please analyze this codebase and explain its structure.")}"`,
      ),
    );
    result.push(style.dim("  Use Ctrl+C to interrupt acai and exit."));

    result.push("");

    result.push(
      style.yellow(`The current working directory is ${process.cwd()}`),
    );

    return result;
  }

  private getLogo(): string {
    return `
   █████╗  ██████╗ █████╗ ██╗
  ██╔══██╗██╔════╝██╔══██╗██║
  ███████║██║     ███████║██║
  ██╔══██║██║     ██╔══██║██║
  ██║  ██║╚██████╗██║  ██║██║
  ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝
                                       `;
  }
}
