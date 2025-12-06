/**
 * Execution Environment Module
 *
 * Provides functionality for executing shell commands and scripts
 * in a controlled environment with proper error handling.
 */
import { exec, spawn } from "node:child_process";
import { logger } from "../logger.ts";

/**
 * Result of a command execution
 */
interface ExecutionResult {
  output: string;
  exitCode: number;
  error?: Error;
  command: string;
  duration: number;
}

/**
 * Command execution options
 */
interface ExecutionOptions {
  /** Working directory where the command will be executed */
  cwd?: string;
  env?: Record<string, string>;
  /** Timeout in milliseconds before killing the process */
  timeout?: number;
  shell?: string;
  /** Maximum buffer size in bytes (defaults to 1MB) */
  maxBuffer?: number;
  captureStderr?: boolean;
  /** Whether to include stdout/stderr in the result even when there's an error (defaults to true) */
  preserveOutputOnError?: boolean;
  /** AbortSignal to cancel the execution */
  abortSignal?: AbortSignal;
  /** Whether to throw an error on non-zero exit codes (defaults to false) */
  throwOnError?: boolean;
}

/**
 * Background process options
 */
interface BackgroundProcessOptions extends ExecutionOptions {
  onOutput?: (output: string) => void;
  onError?: (error: string) => void;
  onExit?: (code: number | null) => void;
}

/**
 * Background process handle (public interface)
 */
interface BackgroundProcess {
  pid: number;
  kill: () => boolean;
  isRunning: boolean;
}

/**
 * Tracked background process with project information
 */
interface TrackedBackgroundProcess extends BackgroundProcess {
  originalCwd: string;
  startTime: Date;
  command: string;
}

/**
 * List of dangerous commands that shouldn't be executed
 */
const DANGEROUS_COMMANDS = [
  /^\s*rm\s+(-rf?|--recursive)\s+[/~]/i, // rm -rf / or similar
  /^\s*dd\s+.*of=\/dev\/(disk|hd|sd)/i, // dd to a device
  /^\s*mkfs/i, // Format a filesystem
  /^\s*:\(\)\{\s*:\|:\s*&\s*\}\s*;/, // Fork bomb
  /^\s*>(\/dev\/sd|\/dev\/hd)/, // Overwrite disk device
  /^\s*sudo\s+.*(rm|mkfs|dd|chmod|chown)/i, // sudo with dangerous commands
];

/**
 * Maximum command execution time (30 seconds by default)
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Maximum output buffer size (5MB by default)
 */
const DEFAULT_MAX_BUFFER = 5 * 1024 * 1024;

/**
 * Execution environment manager
 */
interface ExecutionConfig {
  env?: string;
  execution?: {
    cwd?: string;
    env?: Record<string, string>;
    shell?: string;
    allowedCommands?: Array<string | RegExp>;
  };
}

function getShell() {
  return process.env["ZSH_VERSION"] ? "zsh" : process.env["SHELL"] || "bash";
}

function ttySizeEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (
    process.stdout.isTTY &&
    typeof process.stdout.columns === "number" &&
    typeof process.stdout.rows === "number"
  ) {
    env["COLUMNS"] = String(process.stdout.columns - 2);
    env["LINES"] = String(process.stdout.rows);
  } else {
    if (typeof process.env["COLUMNS"] === "string")
      env["COLUMNS"] = process.env["COLUMNS"] as string;
    if (typeof process.env["LINES"] === "string")
      env["LINES"] = process.env["LINES"] as string;
  }
  return env;
}

export class ExecutionEnvironment {
  private config: ExecutionConfig;
  private backgroundProcesses: Map<number, TrackedBackgroundProcess> =
    new Map();
  private executionCount = 0;
  private workingDirectory: string;
  private environmentVariables: Record<string, string>;

  /**
   * Create a new execution environment
   */
  constructor(config: ExecutionConfig = {}) {
    this.config = config;
    this.workingDirectory = config.execution?.cwd || process.cwd();

    // Set up environment variables
    this.environmentVariables = {
      ...(process.env as Record<string, string>),
      // biome-ignore lint/style/useNamingConvention: environment variable.
      NODE_ENV: config.env || "production",
      ...(config.execution?.env || {}),
    };

    logger.debug(
      {
        workingDirectory: this.workingDirectory,
      },
      "Execution environment created",
    );
  }

  /**
   * Initialize the execution environment
   */
  async initialize(): Promise<void> {
    logger.info("Initializing execution environment");

    try {
      // Verify shell is available
      const shell = this.config.execution?.shell || getShell();

      await this.executeCommand(`${shell} -c "echo Shell is available"`, {
        timeout: 5000,
      });

      logger.info("Execution environment initialized successfully");
    } catch (error) {
      logger.error(error, "Failed to initialize execution environment");
      throw new Error("Failed to initialize command execution environment", {
        cause: error,
      });
    }
  }

  /**
   * Execute a shell command
   */
  async executeCommand(
    command: string,
    options: ExecutionOptions = {},
  ): Promise<ExecutionResult> {
    // Increment execution count
    this.executionCount++;

    // Validate command for safety
    this.validateCommand(command);

    const cwd = options.cwd || this.workingDirectory;
    const env = {
      ...this.environmentVariables,
      ...ttySizeEnv(),
      ...(options.env || {}),
    };
    const timeout = options.timeout || DEFAULT_TIMEOUT;
    const maxBuffer = options.maxBuffer || DEFAULT_MAX_BUFFER;
    const shell = options.shell || this.config.execution?.shell || getShell();
    const captureStderr = options.captureStderr !== false;
    const preserveOutputOnError = options.preserveOutputOnError !== false;
    const throwOnError = options.throwOnError === true;

    logger.debug(
      {
        command,
        cwd,
        shell,
        timeout,
        executionCount: this.executionCount,
        hasAbortSignal: !!options.abortSignal,
      },
      "Executing command",
    );

    const startTime = Date.now();

    return new Promise<ExecutionResult>((resolve, reject) => {
      // Check if already aborted
      if (options.abortSignal?.aborted) {
        const error = new Error("Command execution aborted");
        logger.warn({ command }, "Command execution aborted before starting");
        resolve({
          output: "",
          exitCode: 1,
          error,
          command,
          duration: 0,
        });
        return;
      }

      const childProcess = exec(
        command,
        {
          cwd,
          env,
          timeout,
          maxBuffer,
          shell,
          windowsHide: true,
          encoding: "utf8",
        },
        (error: Error | null, stdout: string, stderr: string) => {
          const duration = Date.now() - startTime;

          // Combine stdout and stderr if requested
          const output = captureStderr
            ? `${stdout}${stderr ? stderr : ""}`
            : stdout;

          if (error) {
            logger.error(
              {
                error: error.message,
                exitCode: (error as Error & { code: number }).code,
                duration,
              },
              `Command execution failed: ${command}`,
            );

            const result = {
              output: preserveOutputOnError ? output : "",
              exitCode: (error as Error & { code: number }).code || 1,
              error,
              command,
              duration,
            };

            if (throwOnError) {
              reject(error);
            } else {
              resolve(result);
            }
          } else {
            logger.debug(
              {
                duration,
                outputLength: output.length,
              },
              `Command executed successfully: ${command}`,
            );

            resolve({
              output,
              exitCode: 0,
              command,
              duration,
            });
          }
        },
      );

      // Handle abort signal
      if (options.abortSignal) {
        const abortHandler = () => {
          logger.warn(
            { command, pid: childProcess.pid },
            "Command execution aborted",
          );
          childProcess.kill("SIGTERM");
          const error = new Error("Command execution aborted");
          const result = {
            output: preserveOutputOnError ? "" : "",
            exitCode: 1,
            error,
            command,
            duration: Date.now() - startTime,
          };

          if (throwOnError) {
            reject(error);
          } else {
            resolve(result);
          }
        };

        options.abortSignal.addEventListener("abort", abortHandler, {
          once: true,
        });

        // Clean up abort listener when process completes
        childProcess.on("exit", () => {
          options.abortSignal?.removeEventListener("abort", abortHandler);
        });
      }
    });
  }

  /**
   * Execute a command in the background
   */
  executeCommandInBackground(
    command: string,
    options: BackgroundProcessOptions = {},
  ): BackgroundProcess {
    const cwd = options.cwd || this.workingDirectory;

    // Create the tracked process first
    const trackedProcess: TrackedBackgroundProcess = {
      pid: -1, // Will be set after spawn
      kill: () => false, // Will be set after spawn
      isRunning: true,
      originalCwd: cwd,
      startTime: new Date(),
      command,
    };
    // Validate command for safety
    this.validateCommand(command);
    const env = {
      ...this.environmentVariables,
      ...ttySizeEnv(),
      ...(options.env || {}),
    };
    const shell =
      options.shell ||
      this.config.execution?.shell ||
      process.env["SHELL"] ||
      "bash";

    logger.debug(
      {
        command,
        cwd,
        shell,
        hasAbortSignal: !!options.abortSignal,
      },
      "Executing command in background",
    );

    // Check if already aborted
    if (options.abortSignal?.aborted) {
      logger.warn(
        { command },
        "Background command execution aborted before starting",
      );
      throw new Error("Background command execution aborted");
    }

    // Spawn the process
    const childProcess = spawn(command, [], {
      cwd,
      env,
      shell,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const pid = childProcess.pid ?? -1;
    let isRunning = true;

    // Update tracked process with actual PID and kill function
    trackedProcess.pid = pid;
    trackedProcess.kill = () => {
      if (isRunning) {
        childProcess.kill();
        isRunning = false;
        this.backgroundProcesses.delete(pid);

        // Clean up abort listener
        if (abortHandler) {
          options.abortSignal?.removeEventListener("abort", abortHandler);
        }

        return true;
      }
      return false;
    };

    // Set up output handlers
    if (childProcess.stdout) {
      childProcess.stdout.on("data", (data: Buffer) => {
        const output = data.toString("utf8");
        logger.debug({ output }, `Background command (pid ${pid}) output:`);

        if (options.onOutput) {
          options.onOutput(output);
        }
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.on("data", (data: Buffer) => {
        const errorOutput = data.toString("utf8");
        logger.debug({ errorOutput }, `Background command (pid ${pid}) error:`);

        if (options.onError) {
          options.onError(errorOutput);
        }
      });
    }

    // Set up exit handler
    childProcess.on("exit", (code) => {
      isRunning = false;
      logger.debug(`Background command (pid ${pid}) exited with code ${code}`);

      // Remove from tracked processes
      this.backgroundProcesses.delete(pid);

      // Clean up abort listener
      if (abortHandler) {
        options.abortSignal?.removeEventListener("abort", abortHandler);
      }

      if (options.onExit) {
        options.onExit(code);
      }
    });

    // Handle abort signal for background process
    let abortHandler: (() => void) | undefined;
    if (options.abortSignal) {
      abortHandler = () => {
        logger.warn({ command, pid }, "Background command execution aborted");
        if (isRunning) {
          childProcess.kill("SIGTERM");
          isRunning = false;
          this.backgroundProcesses.delete(pid);
        }
      };

      options.abortSignal.addEventListener("abort", abortHandler, {
        once: true,
      });
    }

    // Create the public process handle
    const backgroundProcess: BackgroundProcess = {
      pid,
      kill: trackedProcess.kill,
      isRunning: true,
    };

    // Track the process
    this.backgroundProcesses.set(pid, trackedProcess);

    return backgroundProcess;
  }

  /**
   * Get background processes for a specific project directory
   */
  getBackgroundProcessesForProject(
    projectRoot: string,
  ): TrackedBackgroundProcess[] {
    const processes: TrackedBackgroundProcess[] = [];

    for (const process of this.backgroundProcesses.values()) {
      // Check if process was started in or under the project root
      if (process.originalCwd.startsWith(projectRoot)) {
        processes.push(process);
      }
    }

    return processes;
  }

  /**
   * Kill all background processes for a specific project directory
   */
  killBackgroundProcessesForProject(projectRoot: string): void {
    const processes = this.getBackgroundProcessesForProject(projectRoot);

    logger.info(
      `Killing ${processes.length} background processes for project: ${projectRoot}`,
    );

    for (const process of processes) {
      try {
        process.kill();
      } catch (error) {
        logger.warn(error, `Failed to kill process ${process.pid}`);
      }
    }
  }

  /**
   * Kill all running background processes
   */
  killAllBackgroundProcesses(): void {
    logger.info(
      `Killing ${this.backgroundProcesses.size} background processes`,
    );

    for (const process of this.backgroundProcesses.values()) {
      try {
        process.kill();
      } catch (error) {
        logger.warn(error, `Failed to kill process ${process.pid}`);
      }
    }

    this.backgroundProcesses.clear();
  }

  /**
   * Validate a command for safety
   */
  validateCommand(command: string): void {
    // Check if command is in the denied list
    for (const pattern of DANGEROUS_COMMANDS) {
      if (pattern.test(command)) {
        throw new Error(
          `Command execution blocked: '${command}' matches dangerous pattern`,
        );
      }
    }

    // Check if command is in allowed list (if configured)
    if (
      this.config.execution?.allowedCommands &&
      this.config.execution.allowedCommands.length > 0
    ) {
      const allowed = this.config.execution.allowedCommands.some(
        (allowedPattern: string | RegExp) => {
          if (typeof allowedPattern === "string") {
            return command.startsWith(allowedPattern);
          }
          return allowedPattern.test(command);
        },
      );

      if (!allowed) {
        throw new Error(
          `Command execution blocked: '${command}' is not in the allowed list`,
        );
      }
    }
  }

  /**
   * Set the working directory
   */
  setWorkingDirectory(directory: string): void {
    this.workingDirectory = directory;
    logger.debug(`Working directory set to: ${directory}`);
  }

  /**
   * Get the working directory
   */
  getWorkingDirectory(): string {
    return this.workingDirectory;
  }

  /**
   * Set an environment variable
   */
  setEnvironmentVariable(name: string, value: string): void {
    this.environmentVariables[name] = value;
    logger.debug(`Environment variable set: ${name}=${value}`);
  }

  /**
   * Get an environment variable
   */
  getEnvironmentVariable(name: string): string | undefined {
    return this.environmentVariables[name];
  }
}

/**
 * Initialize the execution environment
 */
export async function initExecutionEnvironment(
  config: ExecutionConfig = {},
): Promise<ExecutionEnvironment> {
  logger.info("Initializing execution environment");

  try {
    const executionEnv = new ExecutionEnvironment(config);
    await executionEnv.initialize();

    // Set up cleanup for background processes
    setupProcessCleanup(executionEnv);

    logger.info("Execution environment initialized successfully");

    return executionEnv;
  } catch (error) {
    logger.error(error, "Failed to initialize execution environment");

    // Return a minimal execution environment even if initialization failed
    const executionEnv = new ExecutionEnvironment(config);
    setupProcessCleanup(executionEnv);
    return executionEnv;
  }
}

// const platformName = process.platform;
// let cmd: string;
// let args: string[] = [];
// const useShellOption = false;

// if (platformName === "win32") {
//   const { execSync } = await import("node:child_process");
//   try {
//     execSync("where wsl", { stdio: "ignore" });
//     cmd = "wsl.exe";
//     args = ["--", command];
//   } catch {
//     cmd = "powershell.exe";
//     args = ["-NoProfile", "-NonInteractive", "-Command", command];
//   }
// } else {
//   const shell = process.env["SHELL"] || "/bin/bash";
//   cmd = shell;
//   args = ["-c", command];
// }

// Set up cleanup on process exit
function setupProcessCleanup(executionEnv: ExecutionEnvironment): void {
  process.on("exit", () => {
    executionEnv.killAllBackgroundProcesses();
  });

  process.on("SIGINT", () => {
    executionEnv.killAllBackgroundProcesses();
  });

  process.on("SIGTERM", () => {
    executionEnv.killAllBackgroundProcesses();
  });
}
