export interface ExitCommandOptions {
  sessionManager: {
    isEmpty: () => boolean;
    save: () => Promise<void>;
  };
  baseDir?: string | null;
}
