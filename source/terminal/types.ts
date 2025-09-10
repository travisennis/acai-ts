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
