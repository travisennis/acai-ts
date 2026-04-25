#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { asyncTry, isFailure, syncTry } from "@travisennis/stdlib/try";
import { isDefined } from "@travisennis/stdlib/typeguards";
import { Agent } from "./agent/index.ts";
import { Cli } from "./cli/index.ts";
import { readStdinWithLimits } from "./cli/stdin.ts";
import { CommandManager } from "./commands/manager.ts";
import { type Config, config, type DirectoryProvider } from "./config/index.ts";
import { ModelManager } from "./models/manager.ts";
import { isSupportedModel, type ModelName } from "./models/providers.ts";
import { PromptManager } from "./prompts/manager.ts";
import { processPrompt } from "./prompts/mentions.ts";
import { systemPrompt } from "./prompts/system-prompt.ts";
import { Repl } from "./repl/index.ts";
import { SessionManager } from "./sessions/manager.ts";
import { writeExitSummary } from "./sessions/summary.ts";
import { setTerminalTitle } from "./terminal/control.ts";
import { select } from "./terminal/select-prompt.ts";
import { TokenCounter } from "./tokens/counter.ts";
import { TokenTracker } from "./tokens/tracker.ts";
import {
  type CompleteToolNames,
  getActivatedSkillsTracker,
  initTools,
} from "./tools/index.ts";
import { logger } from "./utils/logger.ts";
import { getPackageVersion } from "./utils/version.ts";

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
    "/tmp",
    "/tmp/acai",
    "/var/folders",
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
  --no-session       Don't save session to disk

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
      "no-session": { type: "boolean", default: false },

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
  appConfig: Config;
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
  appConfig: Config,
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
    : "opencode-go:glm-5-1"; // DEFAULT MODEL

  const projectConfig = await config.getConfig();
  const devtoolsEnabled = projectConfig.devtools?.enabled ?? false;

  const modelManager = new ModelManager({
    stateDir: await appDir.ensurePath("audit"),
    devtoolsEnabled,
  });

  modelManager.setModel("repl", chosenModel);
  modelManager.setModel("cli", chosenModel);
  modelManager.setModel("title-conversation", chosenModel);
  modelManager.setModel("conversation-summarizer", chosenModel);
  modelManager.setModel("tool-repair", "openai:gpt-5.4-mini");
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

async function runCliMode(state: AppState, noSession: boolean): Promise<void> {
  const cliProcess = new Cli({
    promptManager: state.promptManager,
    sessionManager: state.sessionManager,
    modelManager: state.modelManager,
    tokenTracker: state.tokenTracker,
    tokenCounter: state.tokenCounter,
    workspace,
    noSession,
  });
  (await asyncTry(cliProcess.run())).recover(handleError);
}

function setupReplEventHandlers(
  repl: Repl,
  agent: Agent,
  sessionManager: SessionManager,
  noSession: boolean,
): void {
  sessionManager.on("clear-history", async () => {
    logger.info("Resetting agent state.");
    agent.resetState();
    agent.setConfig(await config.getConfig());
    getActivatedSkillsTracker().reset();
    void repl.rerender();
  });

  repl.setInterruptCallback(async () => {
    if (!noSession) {
      try {
        await sessionManager.save();
      } catch (error) {
        logger.warn({ error }, "Failed to save message history on interrupt");
      }
    }
    agent.abort();
  });

  repl.setExitCallback(async (_sessionId: string) => {
    if (!sessionManager.isEmpty()) {
      await repl.triggerRuleGeneration();
      writeExitSummary(sessionManager, noSession);
    }
  });
}

async function handleStdinPrompt(
  state: AppState,
  agent: Agent,
  repl: Repl,
  tools: Awaited<ReturnType<typeof initTools>>,
  activeTools: CompleteToolNames[] | undefined,
  systemPromptResult: { prompt: string },
  noSession: boolean,
): Promise<boolean> {
  if (!state.promptManager.isPending()) {
    return false;
  }

  try {
    const promptText = state.promptManager.get();
    const userMessage = state.promptManager.getUserMessage();
    state.sessionManager.appendUserMessage(userMessage);

    const results = agent.run({
      systemPrompt: systemPromptResult.prompt,
      input: promptText,
      tools,
      activeTools,
      abortSignal: agent.abortSignal,
      maxIterations: state.appConfig.loop.maxIterations,
    });
    for await (const result of results) {
      await repl.handle(result, agent.state);
    }

    if (!noSession) {
      await state.sessionManager.save();
    }
    return true;
  } catch {
    return false;
  }
}

async function runInteractiveLoop(
  repl: Repl,
  agent: Agent,
  tools: Awaited<ReturnType<typeof initTools>>,
  activeTools: CompleteToolNames[] | undefined,
  systemPromptResult: { prompt: string },
  noSession: boolean,
  sessionManager: SessionManager,
  maxIterations: number,
): Promise<void> {
  while (true) {
    const userInput = await repl.getUserInput();

    try {
      const results = agent.run({
        systemPrompt: systemPromptResult.prompt,
        input: userInput,
        tools,
        activeTools,
        abortSignal: agent.abortSignal,
        maxIterations,
      });
      for await (const result of results) {
        await repl.handle(result, agent.state);
      }

      if (!noSession) {
        await sessionManager.save();
      }
    } catch {
      // Error displayed in the TUI
    }
  }
}

async function runReplMode(
  state: AppState,
  stdinWasPiped: boolean,
  noSession: boolean,
): Promise<void> {
  const tools = await initTools({ workspace });

  const agent = new Agent({
    config: state.appConfig,
    sessionManager: state.sessionManager,
    modelManager: state.modelManager,
    tokenTracker: state.tokenTracker,
  });

  const repl = new Repl({
    agent,
    promptManager: state.promptManager,
    configManager: config,
    sessionManager: state.sessionManager,
    modelManager: state.modelManager,
    tokenTracker: state.tokenTracker,
    commands: state.commands,
    tokenCounter: state.tokenCounter,
    promptHistory: state.promptHistory,
    workspace,
    tools,
    terminalOptions: { useTty: stdinWasPiped },
    noSession,
  });

  await repl.init();

  if (!state.sessionManager.isEmpty()) {
    await repl.rerender();
  }

  setupReplEventHandlers(repl, agent, state.sessionManager, noSession);

  const activeTools = state.appConfig.tools.activeTools as
    | CompleteToolNames[]
    | undefined;
  const skillsEnabled =
    !flags["no-skills"] && (state.appConfig.skills?.enabled ?? true);
  const systemPromptResult = await systemPrompt({
    activeTools,
    allowedDirs: workspace.allowedDirs,
    logsPath: state.appConfig.logs?.path,
    skillsEnabled,
  });

  await handleStdinPrompt(
    state,
    agent,
    repl,
    tools,
    activeTools,
    systemPromptResult,
    noSession,
  );

  await runInteractiveLoop(
    repl,
    agent,
    tools,
    activeTools,
    systemPromptResult,
    noSession,
    state.sessionManager,
    state.appConfig.loop.maxIterations,
  );
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

    // Add logs directory to allowed directories if configured
    const logsPath = (await config.getConfig()).logs?.path;
    if (logsPath) {
      // Expand ~ to home directory before resolving
      const expandedLogsPath =
        logsPath.startsWith("~/") || logsPath === "~"
          ? path.join(os.homedir(), logsPath.slice(1))
          : logsPath;
      const logsDir = path.dirname(path.resolve(expandedLogsPath));
      if (!workspace.allowedDirs.includes(logsDir)) {
        workspace.allowedDirs.push(logsDir);
      }
    }

    // Set terminal title after all validation is complete
    setTerminalTitle(`acai: ${workspace.primaryDir}`);

    // Handle CLI mode if initial prompt provided
    if (isDefined(initialPromptInput)) {
      return await runCliMode(state, flags["no-session"] === true);
    }

    // Setup REPL mode
    return await runReplMode(
      state,
      stdinContent !== null,
      flags["no-session"] === true,
    );
  } catch (error) {
    handleError(error as Error);
    process.exit(1);
  }
}

void main();
