#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { asyncTry, isFailure, syncTry } from "@travisennis/stdlib/try";
import { isDefined } from "@travisennis/stdlib/typeguards";
import { Agent } from "./agent/index.ts";
import { Cli } from "./cli.ts";
import { CommandManager } from "./commands/manager.ts";
import {
  config,
  type DirectoryProvider,
  type ProjectConfig,
} from "./config.ts";
import { logger } from "./logger.ts";
import { processPrompt } from "./mentions.ts";
import { ModelManager } from "./models/manager.ts";
import { isSupportedModel, type ModelName } from "./models/providers.ts";
import { PromptManager } from "./prompts/manager.ts";
import { systemPrompt } from "./prompts.ts";
import { Repl } from "./repl.ts";
import { SessionManager } from "./sessions/manager.ts";
import { readStdinWithLimits } from "./stdin.ts";
import { setTerminalTitle } from "./terminal/control.ts";
import { select } from "./terminal/select-prompt.ts";
import { TokenCounter } from "./tokens/counter.ts";
import { TokenTracker } from "./tokens/tracker.ts";
import { type CompleteToolNames, initTools } from "./tools/index.ts";
import { getPackageVersion } from "./version.ts";

// Workspace context for managing multiple working directories
export interface WorkspaceContext {
  primaryDir: string;
  allowedDirs: string[];
}

// Create workspace context from CLI arguments
export function createWorkspaceContext(
  addDirArgs: string[] = [],
): WorkspaceContext {
  const primaryDir = process.cwd();
  mkdirSync("/tmp/acai", { recursive: true });
  const allowedDirs = [
    primaryDir,
    "/tmp/acai",
    path.join(os.homedir(), ".acai"),
    path.join(os.homedir(), ".agents"),
    ...addDirArgs,
  ];

  // Remove duplicates while preserving order
  const uniqueDirs = allowedDirs.filter(
    (dir, index, array) => array.indexOf(dir) === index,
  );

  return {
    primaryDir,
    allowedDirs: uniqueDirs,
  };
}

const helpText = `
Usage
  $ acai <input>

Options
  --model, -m        Sets the model to use
  --prompt, -p       Sets the prompt (runs in CLI mode)
  --continue         Select a conversation to resume from a list
  --resume           Resume a specific session by ID, or most recent if no ID given
  --add-dir          Add additional working directory (can be used multiple times)
  --no-skills        Disable skills discovery and loading


  --help, -h         Show help
  --version, -v      Show version

Examples
  $ acai --model anthropic:sonnet
  $ acai -p "initial prompt"
  $ acai --add-dir /path/to/project1 --add-dir /path/to/project2
  $ acai --continue
  $ acai --resume
  $ acai --resume a1b2c3d4-e5f6-7890-1234-567890abcdef
`;

const parsed = syncTry(() =>
  parseArgs({
    options: {
      model: { type: "string", short: "m" },
      prompt: { type: "string", short: "p" },
      continue: { type: "boolean", default: false },
      resume: { type: "boolean", default: false },

      "add-dir": { type: "string", multiple: true },
      "no-skills": { type: "boolean", default: false },

      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
    allowPositionals: true,
  }),
);

if (isFailure(parsed)) {
  console.error(parsed.error.message);
  console.info(helpText);
  process.exit(0);
}

const flags = parsed.unwrap().values;
const input = parsed.unwrap().positionals;

// Create workspace context from CLI arguments
const workspace = createWorkspaceContext(flags["add-dir"]);

/**
 * Global error handler function.
 * @param {Error} error - The error to be handled.
 * @throws {Error} Rethrows the error after logging it.
 */
export function handleError(error: Error): void {
  logger.error({ error: error }, error.message);
}

export type Flags = typeof flags;

// Configuration constants
const DEFAULT_HISTORY_LIMIT = 20; // the amount of sessions to retrieve from session history

// Application state interface
interface AppState {
  appConfig: ProjectConfig;
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
  tokenCounter: TokenCounter;
  sessionManager: SessionManager;
  promptManager: PromptManager;
  promptHistory: string[];
  commands: CommandManager;
}

// Helper functions for main()

async function initializeAppState(
  appConfig: ProjectConfig,
  initialPromptInput: string | undefined,
  stdinContent: string | null,
  hasContinueOrResume: boolean,
  resumeSessionId: string | undefined,
): Promise<AppState> {
  const appDir = config.app;

  // Parallelize independent async operations
  const [sessionsDir, modelManager] = await Promise.all([
    appDir.ensurePath("sessions"),
    initializeModelManager(appDir),
  ]);

  // Initialize synchronous components
  const tokenTracker = new TokenTracker();
  const tokenCounter = new TokenCounter();

  // Initialize dependent components
  const sessionManager = await initializeSessionManager(
    sessionsDir,
    modelManager,
    tokenTracker,
  );

  // Handle conversation history loading
  await handleConversationHistory(
    sessionManager,
    sessionsDir,
    hasContinueOrResume,
    resumeSessionId,
  );

  // Setup prompt manager
  const promptManager = new PromptManager(tokenCounter);
  if (!hasContinueOrResume && isDefined(initialPromptInput)) {
    const modelConfig = modelManager.getModelMetadata("repl");
    const processedPrompt = await processPrompt(initialPromptInput, {
      baseDir: process.cwd(),
      model: modelConfig,
    });
    for (const context of processedPrompt.context) {
      promptManager.addContext(context);
    }
    promptManager.set(processedPrompt.message);
  }

  if (stdinContent && stdinContent.trim().length > 0) {
    if (isDefined(initialPromptInput)) {
      promptManager.addContext(stdinContent);
    } else {
      promptManager.set(stdinContent);
    }
  }

  const promptHistory: string[] = [];

  const commands = new CommandManager({
    promptManager,
    modelManager,
    sessionManager,
    tokenTracker,
    config,
    tokenCounter,
    promptHistory,
    workspace,
  });

  await commands.initializeCommmands();

  return {
    appConfig,
    modelManager,
    tokenTracker,
    tokenCounter,
    sessionManager,
    promptManager,
    promptHistory,
    commands,
  };
}

async function handleEarlyExits(): Promise<boolean> {
  if (flags.version === true) {
    console.info(getPackageVersion());
    process.exit(0);
  }

  if (flags.help === true) {
    console.info(helpText);
    process.exit(0);
  }

  return false;
}

function validateSessionId(id: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return id.length === 36 && uuidRegex.test(id);
}

function validateCliArguments(): void {
  if (flags.continue === true && flags.resume === true) {
    console.error("Cannot use --continue and --resume flags together.");
    process.exit(1);
  }

  if (flags.resume === true && input.length > 0) {
    const sessionId = input[0];
    if (!validateSessionId(sessionId)) {
      console.error(`Invalid session ID: ${sessionId}`);
      console.error(
        "Session ID must be a valid UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)",
      );
      process.exit(1);
    }
  }
}

async function determineInitialPrompt(): Promise<{
  initialPromptInput: string | undefined;
  stdinContent: string | null;
  hasContinueOrResume: boolean;
  resumeSessionId: string | undefined;
}> {
  const hasContinueOrResume = flags.continue === true || flags.resume === true;
  const positionalPrompt = input.at(0);

  const { content: stdinContent, wasPiped } = await readStdinWithLimits();

  if (
    wasPiped &&
    (!stdinContent || stdinContent.trim().length === 0) &&
    !flags.prompt &&
    !positionalPrompt
  ) {
    console.error("No input provided via stdin.");
    process.exit(0);
  }

  const resumeSessionId =
    flags.resume === true && input.length > 0 ? input[0] : undefined;

  const initialPromptInput =
    typeof flags.prompt === "string" && flags.prompt.length > 0
      ? flags.prompt
      : positionalPrompt && positionalPrompt.length > 0 && !resumeSessionId
        ? positionalPrompt
        : undefined;

  if (hasContinueOrResume && isDefined(initialPromptInput)) {
    console.error("Cannot use --continue or --resume with an initial prompt.");
    process.exit(1);
  }

  return {
    initialPromptInput,
    stdinContent,
    hasContinueOrResume,
    resumeSessionId,
  };
}

async function initializeModelManager(
  appDir: DirectoryProvider,
): Promise<ModelManager> {
  const chosenModel: ModelName = isSupportedModel(flags.model)
    ? flags.model
    : "opencode:minimax-m2.1-free";

  const modelManager = new ModelManager({
    stateDir: await appDir.ensurePath("audit"),
  });

  modelManager.setModel("repl", chosenModel);
  modelManager.setModel("cli", chosenModel);
  modelManager.setModel("title-conversation", chosenModel);
  modelManager.setModel("conversation-summarizer", chosenModel);
  modelManager.setModel("tool-repair", "openai:gpt-5.1-codex-mini");
  modelManager.setModel("conversation-analyzer", chosenModel);
  modelManager.setModel("init-project", chosenModel);
  modelManager.setModel("handoff-agent", chosenModel);

  return modelManager;
}

async function initializeSessionManager(
  sessionsDir: string,
  modelManager: ModelManager,
  tokenTracker: TokenTracker,
): Promise<SessionManager> {
  const sessionManager = new SessionManager({
    stateDir: sessionsDir,
    modelManager,
    tokenTracker,
  });
  sessionManager.on("update-title", (title) => setTerminalTitle(title));

  // Listen for model changes and update session manager when repl model changes
  modelManager.on("set-model", (app, _model) => {
    if (app === "repl") {
      const modelId = modelManager.getModel("repl").modelId;
      sessionManager.setModelId(modelId);
    }
  });

  return sessionManager;
}

async function handleConversationHistory(
  sessionManager: SessionManager,
  sessionsDir: string,
  _hasContinueOrResume: boolean,
  resumeSessionId: string | undefined,
): Promise<void> {
  if (flags.continue === true) {
    const histories = await SessionManager.load(
      sessionsDir,
      DEFAULT_HISTORY_LIMIT,
    );
    if (histories.length > 0) {
      try {
        const choice = await select({
          message: "Select a conversation to resume:",
          choices: histories.map((h, index) => ({
            name: `${index + 1}: ${h.title} [${h.sessionId}] (${h.updatedAt.toLocaleString()})`,
            value: index,
            description: `${h.messages.length} messages`,
          })),
        });
        const selectedHistory = histories.at(choice);
        if (selectedHistory) {
          sessionManager.restore(selectedHistory);
          logger.info(`Resuming conversation: ${selectedHistory.title}`);
          setTerminalTitle(selectedHistory.title || `acai: ${process.cwd()}`);
        } else {
          logger.error("Selected history index out of bounds.");
        }
      } catch (error) {
        if (
          error instanceof Error &&
          "isCanceled" in error &&
          error.isCanceled === true
        ) {
          logger.info("Resume selection cancelled.");
        } else {
          throw error;
        }
      }
    } else {
      logger.info("No previous conversations found to continue.");
    }
  } else if (flags.resume === true) {
    if (resumeSessionId) {
      const histories = await SessionManager.load(
        sessionsDir,
        DEFAULT_HISTORY_LIMIT,
      );
      const targetHistory = histories.find(
        (h) => h.sessionId === resumeSessionId,
      );
      if (targetHistory) {
        sessionManager.restore(targetHistory);
        logger.info(`Resuming conversation: ${targetHistory.title}`);
        setTerminalTitle(targetHistory.title || `acai: ${process.cwd()}`);
      } else {
        console.error(`Session not found: ${resumeSessionId}`);
        process.exit(1);
      }
    } else {
      const histories = await SessionManager.load(sessionsDir, 1); // read the most recent session
      const latestHistory = histories.at(0);
      if (latestHistory) {
        sessionManager.restore(latestHistory);
        console.info(`Resuming conversation: ${latestHistory.title}`);
        setTerminalTitle(latestHistory.title || `acai: ${process.cwd()}`);
      } else {
        logger.info("No previous conversation found to resume.");
      }
    }
  }
}

async function runCliMode(state: AppState): Promise<void> {
  const cliProcess = new Cli({
    promptManager: state.promptManager,
    sessionManager: state.sessionManager,
    modelManager: state.modelManager,
    tokenTracker: state.tokenTracker,
    tokenCounter: state.tokenCounter,
    workspace,
  });
  (await asyncTry(cliProcess.run())).recover(handleError);
}

async function runReplMode(
  state: AppState,
  stdinWasPiped: boolean,
): Promise<void> {
  // Initialize tools before creating REPL (needed for session reload reconstruction)
  const tools = await initTools({
    workspace,
  });

  const agent = new Agent({
    sessionManager: state.sessionManager,
    modelManager: state.modelManager,
    tokenTracker: state.tokenTracker,
  });

  // When stdin was piped, use /dev/tty for interactive input instead of process.stdin
  const repl = new Repl({
    agent,
    promptManager: state.promptManager,
    config: state.appConfig,
    sessionManager: state.sessionManager,
    modelManager: state.modelManager,
    tokenTracker: state.tokenTracker,
    commands: state.commands,
    tokenCounter: state.tokenCounter,
    promptHistory: state.promptHistory,
    workspace,
    tools,
    terminalOptions: { useTty: stdinWasPiped },
  });

  await repl.init();

  // Reconstruct session display if there are existing messages
  if (!state.sessionManager.isEmpty()) {
    await repl.rerender();
  }

  state.sessionManager.on("clear-history", () => {
    logger.info("Resetting agent state.");
    agent.resetState();
    void repl.rerender();
  });

  // Set interrupt callback
  repl.setInterruptCallback(async () => {
    try {
      await state.sessionManager.save();
    } catch (error) {
      // Log but don't throw - we still want to abort the agent
      logger.warn({ error }, "Failed to save message history on interrupt");
    }
    agent.abort();
  });

  // Set exit callback
  repl.setExitCallback((sessionId: string) => {
    if (!state.sessionManager.isEmpty()) {
      console.info(`\nTo resume this session call acai --resume ${sessionId}`);
    }
  });

  // Auto-process pending prompt from stdin
  if (state.promptManager.isPending()) {
    const projectConfig = await config.getConfig();
    const activeTools = projectConfig.tools.activeTools as
      | CompleteToolNames[]
      | undefined;
    const skillsEnabled =
      !flags["no-skills"] && (projectConfig.skills?.enabled ?? true);

    try {
      // Get the prompt text before it gets cleared by getUserMessage()
      const promptText = state.promptManager.get();

      // Get the user message (includes context if any) and add to history
      const userMessage = state.promptManager.getUserMessage();
      state.sessionManager.appendUserMessage(userMessage);

      const systemPromptResult = await systemPrompt({
        activeTools,
        allowedDirs: workspace.allowedDirs,
        skillsEnabled,
      });
      const results = agent.run({
        systemPrompt: systemPromptResult.prompt,
        input: promptText,
        tools,
        activeTools,
        abortSignal: agent.abortSignal,
      });
      for await (const result of results) {
        await repl.handle(result, agent.state);
      }

      await state.sessionManager.save();
    } catch (_error) {
      // Error displayed in the TUI
    }
  }

  // Interactive loop
  while (true) {
    const userInput = await repl.getUserInput();
    const projectConfig = await config.getConfig();
    const activeTools = projectConfig.tools.activeTools as
      | CompleteToolNames[]
      | undefined;

    try {
      const systemPromptResult = await systemPrompt({
        activeTools,
        allowedDirs: workspace.allowedDirs,
      });

      const results = agent.run({
        systemPrompt: systemPromptResult.prompt,
        input: userInput,
        tools,
        activeTools,
        abortSignal: agent.abortSignal,
      });
      for await (const result of results) {
        await repl.handle(result, agent.state);
      }

      await state.sessionManager.save();
    } catch (_error) {
      // Display error in the TUI by adding an error message to the chat
      // repl.showError((error as Error).message || "Unknown error occurred");
    }
  }
}

async function main() {
  try {
    const appConfig = await config.ensureDefaultConfig("acai");

    // Note: SIGINT/SIGTERM handlers are set up by CLI and REPL components
    // as needed. We don't set a global handler here to avoid conflicts.

    // Handle early exits
    if (await handleEarlyExits()) return;

    // Validate CLI arguments
    validateCliArguments();

    // Determine initial prompt
    const {
      initialPromptInput,
      stdinContent,
      hasContinueOrResume,
      resumeSessionId,
    } = await determineInitialPrompt();

    // Initialize application state
    const state = await initializeAppState(
      appConfig,
      initialPromptInput,
      stdinContent,
      hasContinueOrResume,
      resumeSessionId,
    );

    // Set terminal title after all validation is complete
    setTerminalTitle(`acai: ${workspace.primaryDir}`);

    // Handle CLI mode if initial prompt provided
    if (isDefined(initialPromptInput)) {
      return await runCliMode(state);
    }

    // Setup REPL mode
    return await runReplMode(state, stdinContent !== null);
  } catch (error) {
    handleError(error as Error);
    process.exit(1);
  }
}

void main();
