/**
 * Terminal Interface Module
 *
 * Provides a user interface for interacting with Claude Code in the terminal.
 * Handles input/output, formatting, and display.
 */

import { readFileSync } from "node:fs";
import { join } from "@travisennis/stdlib/desm";
import chalk, { type ChalkInstance } from "chalk";
import figlet from "figlet";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";
import ora from "ora";
import { table } from "table";
import terminalLink from "terminal-link";
import { logger } from "../logger.ts";
import { clearScreen, formatOutput, getTerminalSize } from "./formatting.ts";
import type { SpinnerInstance, TerminalConfig } from "./types.ts";

marked.setOptions({
  // Define custom renderer
  renderer: new TerminalRenderer() as any,
});

/**
 * Initialize the terminal interface
 */
export function initTerminal(
  config: {
    terminal?: Partial<TerminalConfig>;
  } = {},
): Terminal {
  logger.debug("Initializing terminal interface");

  const terminalConfig: TerminalConfig = {
    theme: config.terminal?.theme || "system",
    useColors: config.terminal?.useColors !== false,
    showProgressIndicators: config.terminal?.showProgressIndicators !== false,
    codeHighlighting: config.terminal?.codeHighlighting !== false,
    maxHeight: config.terminal?.maxHeight,
    maxWidth: config.terminal?.maxWidth,
  };

  const terminal = new Terminal(terminalConfig);

  try {
    // Detect terminal capabilities
    terminal.detectCapabilities();

    return terminal;
  } catch (error) {
    logger.warn("Error initializing terminal interface:", error);

    // Return a basic terminal interface even if there was an error
    return terminal;
  }
}

/**
 * Terminal class for handling user interaction
 */
export class Terminal {
  private config: TerminalConfig;
  private activeSpinners: Map<string, SpinnerInstance> = new Map();
  private terminalWidth: number;
  private terminalHeight: number;
  private isInteractive: boolean;

  constructor(config: TerminalConfig) {
    this.config = config;

    // Get initial terminal size
    const { rows, columns } = getTerminalSize();
    this.terminalHeight = config.maxHeight || rows;
    this.terminalWidth = config.maxWidth || columns;

    // Assume interactive by default
    this.isInteractive = process.stdout.isTTY && process.stdin.isTTY;

    // Listen for terminal resize events
    process.stdout.on("resize", () => {
      const { rows, columns } = getTerminalSize();
      this.terminalHeight = config.maxHeight || rows;
      this.terminalWidth = config.maxWidth || columns;
      logger.debug(`Terminal resized to ${columns}x${rows}`);
    });
  }

  /**
   * Detect terminal capabilities
   */
  detectCapabilities() {
    // Check if the terminal is interactive
    this.isInteractive = process.stdout.isTTY && process.stdin.isTTY;

    // Check color support
    if (this.config.useColors && !chalk.level) {
      logger.warn("Terminal does not support colors, disabling color output");
      this.config.useColors = false;
    }

    logger.debug("Terminal capabilities detected", {
      isInteractive: this.isInteractive,
      colorSupport: this.config.useColors ? "yes" : "no",
      size: `${this.terminalWidth}x${this.terminalHeight}`,
    });
  }

  /**
   * Display the welcome message
   */
  displayWelcome(): void {
    this.clear();

    const packageJson = JSON.parse(
      readFileSync(join(import.meta.url, "..", "..", "package.json"), "utf8"),
    );
    const version = packageJson.version;

    this.writeln(chalk.magenta(figlet.textSync("acai")));
    this.writeln("");
    this.writeln(chalk.magenta("Greetings! I am acai."));
    this.writeln(chalk.gray(`  Version ${version}`));
    this.writeln("");
    this.writeln(
      chalk.white(`  Type ${chalk.cyan("/help")} to see available commands.`),
    );
    this.writeln(
      chalk.white(
        "  You can ask acai to explain code, fix issues, or perform tasks.",
      ),
    );
    this.writeln(
      chalk.white(
        `  Example: "${chalk.italic("Please analyze this codebase and explain its structure.")}"`,
      ),
    );
    this.writeln("");
    this.writeln(
      chalk.yellow(`The current working directory is ${process.cwd()}`),
    );

    // if (this.config.useColors) {
    //   console.log(
    //     chalk.dim(
    //       "  Pro tip: Use Ctrl+C to interrupt acai and start over.\n",
    //     ),
    //   );
    // }
  }

  /**
   * Clear the terminal screen
   */
  clear(): void {
    if (this.isInteractive) {
      clearScreen();
    }
  }

  /**
   * Display formatted content
   */
  display(content: string): void {
    const formatted = formatOutput(content, {
      width: this.terminalWidth,
      colors: this.config.useColors,
      codeHighlighting: this.config.codeHighlighting,
    });

    console.info(formatted);
  }

  /**
   * Display a message with emphasis
   */
  emphasize(message: string): void {
    if (this.config.useColors) {
      console.info(chalk.cyan.bold(message));
    } else {
      console.info(message.toUpperCase());
    }
  }

  /**
   * Display an informational message
   */
  info(message: string): void {
    if (this.config.useColors) {
      console.info(chalk.blue(`ℹ ${message}`));
    } else {
      console.info(`INFO: ${message}`);
    }
  }

  /**
   * Display a success message
   */
  success(message: string): void {
    if (this.config.useColors) {
      console.info(chalk.green(`✓ ${message}`));
    } else {
      console.info(`SUCCESS: ${message}`);
    }
  }

  /**
   * Display a warning message
   */
  warn(message: string): void {
    if (this.config.useColors) {
      console.info(chalk.yellow(`⚠ ${message}`));
    } else {
      console.info(`WARNING: ${message}`);
    }
  }

  /**
   * Display an error message
   */
  error(message: string): void {
    if (this.config.useColors) {
      console.info(chalk.red(`✗ ${message}`));
    } else {
      console.info(`ERROR: ${message}`);
    }
  }

  write(input: string): void {
    process.stdout.write(input);
  }

  writeln(input: string): void {
    process.stdout.write(`${input}\n`);
  }

  lineBreak() {
    this.writeln("");
  }

  header(header: string, chalkFn: ChalkInstance = chalk.green): void {
    const width = process.stdout.columns - header.length - 4;
    process.stdout.write(chalkFn(`\n── ${header} ${"─".repeat(width)}\n`));
  }

  box(
    header: string,
    content: string,
    chalkFn: ChalkInstance = chalk.green,
  ): void {
    const width = process.stdout.columns - 4; // Account for box borders
    const paddedHeader = ` ${header} `;
    const headerStartPos = 1; //Math.floor((width - paddedHeader.length) / 2);

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

  hr(chalkFn: ChalkInstance = chalk.cyan): void {
    process.stdout.write(chalkFn(`\n${"-".repeat(process.stdout.columns)}\n`));
  }

  async markdown(input: string): Promise<void> {
    const md = await marked.parse(input);
    console.info(md);
  }

  /**
   * Create a clickable link in the terminal if supported
   */
  link(text: string, url: string): string {
    return terminalLink(text, url, {
      fallback: (text, url) => `${text} (${url})`,
    });
  }

  /**
   * Display a table of data
   */
  table(
    data: any[][],
    options: { header?: string[]; border?: boolean } = {},
  ): void {
    const config: any = {
      border: options.border
        ? {}
        : {
            topBody: "",
            topJoin: "",
            topLeft: "",
            topRight: "",
            bottomBody: "",
            bottomJoin: "",
            bottomLeft: "",
            bottomRight: "",
            bodyLeft: "",
            bodyRight: "",
            bodyJoin: "",
            joinBody: "",
            joinLeft: "",
            joinRight: "",
            joinJoin: "",
          },
    };

    let finalData = data;
    // Add header row with formatting
    if (options.header) {
      if (this.config.useColors) {
        finalData = [options.header.map((h) => chalk.bold(h)), ...data];
      } else {
        finalData = [options.header, ...data];
      }
    }

    console.info(table(finalData, config));
  }

  /**
   * Create a spinner for showing progress
   */
  spinner(text: string, id = "default"): SpinnerInstance {
    // Clean up existing spinner with the same ID
    if (this.activeSpinners.has(id)) {
      this.activeSpinners.get(id)?.stop();
      this.activeSpinners.delete(id);
    }

    // Create spinner only if progress indicators are enabled and terminal is interactive
    if (this.config.showProgressIndicators && this.isInteractive) {
      const spinner = ora({
        text,
        spinner: "dots",
        color: "cyan",
      }).start();

      const spinnerInstance: SpinnerInstance = {
        id,
        update: (newText: string) => {
          spinner.text = newText;
          return spinnerInstance;
        },
        succeed: (text?: string) => {
          spinner.succeed(text);
          this.activeSpinners.delete(id);
          return spinnerInstance;
        },
        fail: (text?: string) => {
          spinner.fail(text);
          this.activeSpinners.delete(id);
          return spinnerInstance;
        },
        warn: (text?: string) => {
          spinner.warn(text);
          this.activeSpinners.delete(id);
          return spinnerInstance;
        },
        info: (text?: string) => {
          spinner.info(text);
          this.activeSpinners.delete(id);
          return spinnerInstance;
        },
        stop: () => {
          spinner.stop();
          this.activeSpinners.delete(id);
          return spinnerInstance;
        },
      };

      this.activeSpinners.set(id, spinnerInstance);
      return spinnerInstance;
    }
    // Fallback for non-interactive terminals or when progress indicators are disabled
    console.info(text);

    // Return a dummy spinner
    const dummySpinner: SpinnerInstance = {
      id,
      update: (newText: string) => {
        if (newText !== text) {
          console.info(newText);
        }
        return dummySpinner;
      },
      succeed: (text?: string) => {
        if (text) {
          this.success(text);
        }
        return dummySpinner;
      },
      fail: (text?: string) => {
        if (text) {
          this.error(text);
        }
        return dummySpinner;
      },
      warn: (text?: string) => {
        if (text) {
          this.warn(text);
        }
        return dummySpinner;
      },
      info: (text?: string) => {
        if (text) {
          this.info(text);
        }
        return dummySpinner;
      },
      stop: () => {
        return dummySpinner;
      },
    };

    return dummySpinner;
  }
}

// Re-export the types
// biome-ignore lint/performance/noReExportAll: <explanation>
// biome-ignore lint/performance/noBarrelFile: <explanation>
export * from "./types.ts";
