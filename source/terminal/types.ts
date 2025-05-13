/**
 * Terminal theme options
 */
type TerminalTheme = "dark" | "light" | "system";

/**
 * Terminal configuration
 */
export interface TerminalConfig {
  /**
   * Terminal color theme
   */
  theme: TerminalTheme;

  /**
   * Whether to use colors in output
   */
  useColors: boolean;

  /**
   * Whether to show progress indicators
   */
  showProgressIndicators: boolean;

  /**
   * Whether to enable syntax highlighting for code
   */
  codeHighlighting: boolean;

  /**
   * Maximum terminal height (rows)
   */
  maxHeight?: number | undefined;

  /**
   * Maximum terminal width (columns)
   */
  maxWidth?: number | undefined;
}

/**
 * Spinner instance for progress indicators
 */
export interface SpinnerInstance {
  /**
   * Spinner identifier
   */
  id: string;

  /**
   * Update spinner text
   */
  update(text: string): SpinnerInstance;

  /**
   * Mark spinner as successful and stop
   */
  succeed(text?: string): SpinnerInstance;

  /**
   * Mark spinner as failed and stop
   */
  fail(text?: string): SpinnerInstance;

  /**
   * Mark spinner with warning and stop
   */
  warn(text?: string): SpinnerInstance;

  /**
   * Mark spinner with info and stop
   */
  info(text?: string): SpinnerInstance;

  /**
   * Clear spinner without any indicator
   */
  clear(): SpinnerInstance;

  /**
   * Stop spinner without any indicator
   */
  stop(): SpinnerInstance;
}
