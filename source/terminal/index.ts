/**
 * Terminal Interface Module
 *
 * Provides a user interface for interacting with Claude Code in the terminal.
 * Handles input/output, formatting, and display.
 */

export {
  box,
  displayProgressBar,
  formatMarkdown,
  header,
  table,
} from "./components.ts";
export { alert, getShell, isInteractive } from "./control.ts";
export { emphasize, error, hr, info, success, warn } from "./formatting.ts";
