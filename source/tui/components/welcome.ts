import { dedent } from "../../dedent.ts";
import style from "../../terminal/style.ts";
import { getPackageVersion } from "../../version.ts";
import type { Component } from "../tui.ts";
import { BoxComponent } from "./box.ts";

export interface WelcomeOptions {
  type?: "default" | "simple";
}

export class Welcome implements Component {
  private options: WelcomeOptions;

  constructor(options: WelcomeOptions = {}) {
    this.options = options;
  }

  render(width: number): string[] {
    if (this.options.type === "simple") {
      return this.renderSimple();
    }

    return this.renderDefault(width);
  }

  private renderSimple(): string[] {
    const version = getPackageVersion();
    const now = new Date();
    const dateTime = now.toISOString().replace("T", " ").substring(0, 19);

    const slashes =
      style.red("/") +
      style.yellow("/") +
      style.green("/") +
      style.cyan("/") +
      style.magenta("/");

    const line =
      slashes +
      " " +
      style.magenta("acai") +
      " " +
      style.dim("|") +
      " " +
      style.dim("version") +
      " " +
      style.magenta(version) +
      " " +
      style.dim("|") +
      " " +
      style.dim(dateTime);

    return ["", line];
  }

  private renderDefault(width: number): string[] {
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
