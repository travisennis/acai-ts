export interface FileChange {
  fileName: string;
  diff: string;
  stats: string;
}

export interface ReviewCommandOptions {
  tui: unknown;
  container: unknown;
  editor: unknown;
  inputContainer: unknown;
}
