import { dedent } from "../../dedent.ts";
import style from "../../terminal/style.ts";
import { getPackageVersion } from "../../version.ts";
import type { Component } from "../tui.ts";
import { BoxComponent } from "./box.ts";

export class Welcome implements Component {
  render(width: number): string[] {
    const version = getPackageVersion();
    const result: string[] = [];
    result.push(style.magenta(this.getLogo()));
    result.push("");
    result.push(style.magenta("  Welcome to acai"));
    result.push(style.gray(`  Version ${version}`));
    result.push("");

    const boxContent = dedent`
      Type \`/help\` to see available commands.
      You can ask ${style.magenta("acai")} to explain code, fix issues, or perform tasks.
      ${style.yellow("Example:")} "_Please analyze this codebase and explain its structure._"
      Use \`Ctrl+C\` to interrupt acai and exit.
    `;

    result.push(...new BoxComponent("Instructions", boxContent).render(width));

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
