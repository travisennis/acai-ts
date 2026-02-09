import type {
  Agent,
  AgentEvent,
  AgentState,
  ToolEvent,
} from "./agent/index.ts";
import type { CommandManager } from "./commands/manager.ts";
import type { WorkspaceContext } from "./index.ts";
import { logger } from "./logger.ts";
import { processPrompt } from "./mentions.ts";
import type { ModelManager } from "./models/manager.ts";
import { ModeManager } from "./modes/manager.ts";
import type { PromptManager } from "./prompts/manager.ts";
import {
  getProjectStatus,
  type ProjectStatusData,
} from "./repl/project-status.ts";
import { createUserMessage, type SessionManager } from "./sessions/manager.ts";
import {
  alert,
  setTerminalTitle,
  startProgress,
  stopProgress,
} from "./terminal/control.ts";
import style from "./terminal/style.ts";
import type { TokenCounter } from "./tokens/counter.ts";
import type { TokenTracker } from "./tokens/tracker.ts";
import type { CompleteToolSet } from "./tools/index.ts";
import { AssistantMessageComponent } from "./tui/components/assistant-message.ts";
import { FooterComponent } from "./tui/components/footer.ts";
import { ThinkingBlockComponent } from "./tui/components/thinking-block.ts";
import { ToolExecutionComponent } from "./tui/components/tool-execution.ts";
import { Welcome } from "./tui/components/welcome.ts";
import { launchEditor } from "./tui/editor-launcher.ts";
import {
  Container,
  Editor,
  Loader,
  NotificationComponent,
  ProcessTerminal,
  Spacer,
  Text,
  TUI,
  UserMessageComponent,
} from "./tui/index.ts";
import type { ProcessTerminalOptions, Terminal } from "./tui/terminal.ts";

interface ReplOptions {
  agent: Agent;
  sessionManager: SessionManager;
  promptManager: PromptManager;
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
  commands: CommandManager;
  config: Record<PropertyKey, unknown>;
  tokenCounter: TokenCounter;
  promptHistory: string[];
  workspace: WorkspaceContext;
  tools?: CompleteToolSet;
  terminalOptions?: ProcessTerminalOptions;
}

export class Repl {
  private options: ReplOptions;
  private terminal: Terminal;
  private tui: TUI;
  private welcome: Welcome;
  private editor: Editor;
  private chatContainer: Container;
  private statusContainer: Container;
  private footer: FooterComponent;
  private editorContainer: Container; // Container to swap between editor and selector
  private notification: NotificationComponent;
  private isInitialized: boolean;
  private onInputCallback?: (text: string) => void;
  private loadingAnimation: Loader | null = null;
  private onInterruptCallback?: () => void;
  private onExitCallback?: (sessionId: string) => void;
  private lastSigintTime = 0;
  private exitNotificationTimer?: NodeJS.Timeout;
  private pendingTools: Map<string, ToolExecutionComponent>;
  private tools?: CompleteToolSet;

  // Streaming message tracking
  private streamingComponent: AssistantMessageComponent | null = null;

  // thinking block tracking
  private thinkingBlockComponent: ThinkingBlockComponent | null = null;

  // Track all verbose-aware components for re-rendering on toggle
  private allThinkingBlocks: ThinkingBlockComponent[] = [];
  private allToolExecutions: ToolExecutionComponent[] = [];

  // verbose mode state
  private verboseMode = false;

  // mode manager
  private modeManager: ModeManager;

  constructor(options: ReplOptions) {
    this.options = options;
    this.terminal = new ProcessTerminal(options.terminalOptions);
    this.tui = new TUI(this.terminal);
    this.welcome = new Welcome({ type: "simple" });
    this.editor = new Editor({
      borderColor: style.gray,
    });
    this.chatContainer = new Container();
    this.statusContainer = new Container();
    this.editorContainer = new Container(); // Container to hold editor or selector
    this.footer = new FooterComponent(
      options.modelManager,
      options.tokenTracker,
      {
        projectStatus: {
          path: "",
          isGitRepository: false,
          fileChanges: { added: 0, modified: 0, deleted: 0, untracked: 0 },
          diffStats: { insertions: 0, deletions: 0 },
          hasChanges: false,
        } as ProjectStatusData,
        currentContextWindow: 0,
        contextWindow:
          options.modelManager.getModelMetadata("repl").contextWindow,
      },
    );
    this.editorContainer.addChild(this.editor); // Start with editor
    this.editor.onRenderRequested = () => this.tui.requestRender();
    this.editor.onExternalEditor = async (content: string) => {
      return launchEditor({
        initialContent: content,
        postfix: ".md",
        terminal: this.terminal,
      });
    };
    this.isInitialized = false;
    this.pendingTools = new Map();
    this.tools = options.tools;
    this.modeManager = new ModeManager();
    this.notification = new NotificationComponent(
      "",
      { r: 64, g: 64, b: 64 },
      style.yellow,
      1,
    );
  }

  async init() {
    if (this.isInitialized) {
      return;
    }
    // Setup autocomplete for file paths and slash commands
    const { createDefaultProvider } = await import("./tui/autocomplete.ts");
    const autocompleteProvider = createDefaultProvider(
      [...(await this.options.commands.getCompletions())],
      this.options.workspace.allowedDirs,
    );
    this.editor.setAutocompleteProvider(autocompleteProvider);

    const {
      promptManager,
      modelManager,
      sessionManager,
      commands,
      promptHistory,
    } = this.options;

    // Listen for session title updates
    // messageHistory.on("update-title", (title: string) => {
    //   this.footer.setTitle(title);
    //   this.tui.requestRender();
    // });

    const modelConfig = modelManager.getModelMetadata("repl");
    this.footer.setState({
      projectStatus: await getProjectStatus(),
      currentContextWindow: 0,
      contextWindow: modelConfig.contextWindow,
      currentMode: this.modeManager.getDisplayName(),
    });

    this.tui.onCtrlC = () => {
      this.handleCtrlC();
    };

    this.tui.onCtrlD = () => {
      this.handleCtrlD();
    };

    this.tui.onCtrlO = () => {
      this.handleCtrlO();
    };

    this.tui.onCtrlN = () => {
      void this.handleCtrlN();
    };

    this.tui.onCtrlR = () => {
      void commands.handle(
        { userInput: "/review" },
        {
          tui: this.tui,
          container: this.chatContainer,
          inputContainer: this.editorContainer,
          editor: this.editor,
        },
      );
    };

    this.tui.onShiftTab = () => {
      this.modeManager.cycleMode();
      this.notification.setMessage(
        `Mode: ${this.modeManager.getDisplayName()}`,
      );
      this.footer.setState({
        projectStatus: this.footer.getProjectStatus(),
        currentContextWindow:
          this.options.sessionManager.getLastTurnContextWindow(),
        contextWindow:
          this.options.modelManager.getModelMetadata("repl").contextWindow,
        currentMode: this.modeManager.getDisplayName(),
      });
      this.tui.requestRender();
    };

    // Set callback for session reconstruction (used by /history command)
    this.tui.onReconstructSession = () => this.rerender();

    this.tui.addChild(this.welcome);

    // Initialize footer with current title if one exists
    // this.footer.setTitle(messageHistory.getTitle());

    this.tui.addChild(this.chatContainer);
    this.tui.addChild(this.statusContainer);
    this.tui.addChild(new Spacer(1));
    this.tui.addChild(this.editorContainer); // Use container that can hold editor or selector
    this.tui.addChild(this.footer);
    this.tui.addChild(this.notification);
    this.tui.setFocus(this.editor);

    // Set up custom key handlers on the editor
    this.editor.onEscape = () => {
      // Intercept Escape key when processing
      if (this.loadingAnimation && this.onInterruptCallback) {
        this.onInterruptCallback();
      }
    };

    // Create editor for input
    this.editor.onSubmit = async (text) => {
      if (text.trim()) {
        // see if the text contains a command
        const commandResult = await commands.handle(
          { userInput: text },
          {
            tui: this.tui,
            container: this.chatContainer,
            inputContainer: this.editorContainer,
            editor: this.editor,
          },
        );
        if (commandResult.break) {
          this.stop(true);
          process.exit(0);
        }
        if (commandResult.continue) {
          this.editor.setText("");
          this.tui.requestRender();
          return;
        }
        if (!promptManager.isPending()) {
          const processedPrompt = await processPrompt(text, {
            baseDir: process.cwd(),
            model: modelConfig,
          });
          for (const context of processedPrompt.context) {
            promptManager.addContext(context);
          }
          promptManager.set(processedPrompt.message);
        } else {
          promptHistory.push(promptManager.get());
          this.editor.addToHistory(promptManager.get());
        }
        // flag to see if the user prompt has added context
        const hasAddedContext = promptManager.hasContext();

        if (hasAddedContext) {
          const contextTokenCount = promptManager.getContextTokenCount();
          this.chatContainer.addChild(
            new Text(
              style.green(
                `Context will be added to prompt. (${contextTokenCount} tokens)`,
              ),
            ),
          );
        }

        const userPrompt = promptManager.get();
        const userMsg = promptManager.getUserMessage();

        if (!this.modeManager.isNormal()) {
          if (this.modeManager.isFirstMessage()) {
            const initialPrompt = this.modeManager.getInitialPrompt();
            if (initialPrompt) {
              const modeMessage = createUserMessage([], initialPrompt);
              sessionManager.appendUserMessage(modeMessage);
            }
            sessionManager.appendUserMessage(userMsg);
            this.modeManager.markFirstMessageSent();
          } else {
            sessionManager.appendUserMessage(userMsg);
            const reminderMessage = this.modeManager.getReminderMessage();
            if (reminderMessage) {
              sessionManager.setTransientMessages([reminderMessage]);
            }
          }
        } else {
          sessionManager.appendUserMessage(userMsg);
        }

        if (this.onInputCallback) {
          this.onInputCallback(userPrompt);
        }
      }
    };

    // Start
    this.tui.start();

    this.isInitialized = true;
  }

  async handle(event: AgentEvent, state: AgentState) {
    if (!this.isInitialized) {
      await this.init();
    }

    // Update footer with current stats
    // this.footer.updateState(state);

    this.footer.setState({
      projectStatus: await getProjectStatus(),
      currentContextWindow:
        this.options.sessionManager.getLastTurnContextWindow(),
      contextWindow:
        this.options.modelManager.getModelMetadata("repl").contextWindow,
      agentState: state,
      currentMode: this.modeManager.getDisplayName(),
    });

    const eventType = event.type;
    switch (eventType) {
      case "agent-start":
        // start the terminal progress display
        startProgress();
        // disable the submit functionality of the editor
        this.editor.disableSubmit = true;
        // Stop old loader before clearing
        if (this.loadingAnimation) {
          this.loadingAnimation.stop();
        }
        this.statusContainer.clear();
        // Show loading animation
        this.loadingAnimation = new Loader(
          this.tui,
          "Working... (esc to interrupt)",
        );
        this.statusContainer.addChild(this.loadingAnimation);
        this.tui.requestRender();
        break;

      case "step-start":
        // this.tui.requestRender();
        break;

      case "step-stop":
        // this.pendingTools.clear();
        // this.tui.requestRender();
        break;

      case "message-start":
        if (event.role === "assistant") {
          // Create assistant component for streaming
          const assistantMessageComponent = new AssistantMessageComponent();
          this.streamingComponent = assistantMessageComponent;
          this.chatContainer.addChild(assistantMessageComponent);
          this.streamingComponent.updateContent(event);
          this.tui.requestRender();
        }
        break;

      case "message":
        if (event.role === "user") {
          // Show user message immediately and clear editor
          this.addMessageToChat(event);
          this.editor.setText("");
          this.tui.requestRender();
        } else if (event.role === "assistant") {
          // Update streaming component
          if (this.streamingComponent && event.role === "assistant") {
            this.streamingComponent.updateContent(event);

            this.tui.requestRender();
          }
        }
        break;

      case "message-end":
        if (this.streamingComponent && event.role === "assistant") {
          this.streamingComponent.updateContent(event);

          this.streamingComponent = null;

          this.tui.requestRender();
        }
        break;

      case "tool-call-lifecycle": {
        const component = this.pendingTools.get(event.toolCallId);
        if (component) {
          component.update(event.events);
        } else {
          // Create tool component for new tool call
          const newComponent = new ToolExecutionComponent(event.events, {
            verboseMode: this.verboseMode,
          });
          this.pendingTools.set(event.toolCallId, newComponent);
          this.allToolExecutions.push(newComponent);
          this.chatContainer.addChild(newComponent);
        }
        this.tui.requestRender();
        break;
      }

      case "agent-stop":
        // stop the terminal progress display
        stopProgress();
        // send a terminal alert to indicate the agent is done
        await alert();
        // Stop loading animation
        if (this.loadingAnimation) {
          this.loadingAnimation.stop();
          this.loadingAnimation = null;
          this.statusContainer.clear();
        }
        // Clear streaming component reference
        if (this.streamingComponent) {
          this.streamingComponent = null;
        }
        this.pendingTools.clear();
        this.editor.disableSubmit = false;
        this.options.sessionManager.clearTransientMessages();
        this.options.sessionManager.setMetadata(
          "modeState",
          this.modeManager.toJson(),
        );
        await this.options.sessionManager.save();
        this.tui.requestRender();
        break;

      case "agent-error":
        logger.error(event, "agent-error");
        this.options.sessionManager.clearTransientMessages();
        this.options.sessionManager.setMetadata(
          "modeState",
          this.modeManager.toJson(),
        );
        await this.options.sessionManager.save();
        // Stop loading animation
        if (this.loadingAnimation) {
          this.loadingAnimation.stop();
          this.loadingAnimation = null;
          this.statusContainer.clear();
        }
        // Clear streaming component reference
        if (this.streamingComponent) {
          this.streamingComponent = null;
        }
        this.pendingTools.clear();
        this.editor.disableSubmit = false;
        this.tui.requestRender();
        break;

      case "thinking-start": {
        const component = new ThinkingBlockComponent(undefined, {
          verboseMode: this.verboseMode,
        });
        this.thinkingBlockComponent = component;
        this.allThinkingBlocks.push(component);
        this.chatContainer.addChild(component);
        this.thinkingBlockComponent.updateContent(event);
        this.tui.requestRender();
        break;
      }

      case "thinking":
        if (this.thinkingBlockComponent) {
          this.thinkingBlockComponent.updateContent(event);
          this.tui.requestRender();
        }
        break;

      case "thinking-end":
        if (this.thinkingBlockComponent) {
          this.thinkingBlockComponent.endThinking();

          this.thinkingBlockComponent = null;
          this.tui.requestRender();
        }
        break;

      default:
        eventType satisfies never;
    }
  }

  private addMessageToChat(message: { role: "user"; content: string }): void {
    if (message.role === "user") {
      // Extract text content from content blocks
      const textContent = message.content;
      if (textContent) {
        const userComponent = new UserMessageComponent(textContent);
        this.chatContainer.addChild(userComponent);
      }
    }
  }

  async getUserInput(): Promise<string> {
    return new Promise((resolve) => {
      this.onInputCallback = (text: string) => {
        this.onInputCallback = undefined;
        resolve(text);
      };
    });
  }

  clearEditor(): void {
    this.editor.setText("");
    this.tui.requestRender();
  }

  setInterruptCallback(callback: () => void): void {
    this.onInterruptCallback = callback;
  }

  setExitCallback(callback: (sessionId: string) => void): void {
    this.onExitCallback = callback;
  }

  async rerender() {
    const modeState = this.options.sessionManager.getMetadata("modeState");
    if (modeState && typeof modeState === "object" && "mode" in modeState) {
      this.modeManager.fromJson(modeState as { mode: string });
    }

    // When resuming a session, populate tokenTracker with historical usage
    // so the footer displays the correct total session usage
    const totalUsage = this.options.sessionManager.getTotalTokenUsage();
    if (totalUsage.inputTokens > 0 || totalUsage.outputTokens > 0) {
      this.options.tokenTracker.trackUsage("repl", {
        inputTokens: totalUsage.inputTokens,
        outputTokens: totalUsage.outputTokens,
        totalTokens: totalUsage.totalTokens,
        inputTokenDetails: {
          noCacheTokens: totalUsage.inputTokens - totalUsage.cachedInputTokens,
          cacheReadTokens: totalUsage.cachedInputTokens,
          cacheWriteTokens: 0,
        },
        outputTokenDetails: {
          textTokens: totalUsage.outputTokens,
          reasoningTokens: totalUsage.reasoningTokens,
        },
      });
    }

    this.footer.setState({
      projectStatus: await getProjectStatus(),
      currentContextWindow:
        this.options.sessionManager.getLastTurnContextWindow(),
      contextWindow:
        this.options.modelManager.getModelMetadata("repl").contextWindow,
      currentMode: this.modeManager.getDisplayName(),
    });

    // Reconstruct entire session display from messages
    this.reconstructSession();

    this.tui.requestRender();
  }

  private reconstructSession() {
    // Clear existing display
    this.pendingTools.clear();
    this.allThinkingBlocks = [];
    this.allToolExecutions = [];
    this.chatContainer.clear();

    // Get session messages
    const messages = this.options.sessionManager.get();

    // First pass: collect all tool results
    const toolResults = new Map<
      string,
      {
        toolName: string;
        outputValue: string;
        isError: boolean;
      }
    >();

    for (const message of messages) {
      if (message.role !== "tool") continue;

      const content = message.content;
      if (!Array.isArray(content)) continue;

      for (const part of content) {
        if (part.type === "tool-result") {
          const output = part.output;
          const outputValue =
            output && typeof output === "object" && "value" in output
              ? String(output.value)
              : "";

          toolResults.set(part.toolCallId, {
            toolName: part.toolName,
            outputValue,
            isError: false,
          });
        }
      }
    }

    // Second pass: render all messages in order
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

      if (message.role === "user") {
        // Render user message
        const textContent = this.extractUserMessageText(message);
        if (textContent) {
          const userComponent = new UserMessageComponent(textContent);
          this.chatContainer.addChild(userComponent);
        }
      } else if (message.role === "assistant") {
        // Render assistant message text parts
        this.renderAssistantMessage(message);

        // Collect and render tool calls for this assistant message
        const toolCallsForThisAssistant = this.extractToolCallsFromAssistant(
          message,
          toolResults,
        );

        for (const toolCallContent of toolCallsForThisAssistant) {
          const toolCallId = toolCallContent.toolCallId;
          const events = this.createToolEvents(toolCallContent);

          if (events.length > 0) {
            const component = new ToolExecutionComponent(events, {
              verboseMode: this.verboseMode,
            });
            this.pendingTools.set(toolCallId, component);
            this.allToolExecutions.push(component);
            this.chatContainer.addChild(component);
          }
        }
      }
      // Tool messages are handled through their associated assistant message
    }
  }

  private extractUserMessageText(message: {
    role: string;
    content: string | Array<{ type: string; text?: string }>;
  }): string | null {
    if (typeof message.content === "string") {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      const textParts = message.content
        .filter(
          (part): part is { type: "text"; text: string } =>
            part.type === "text" && part.text?.trim() !== undefined,
        )
        .map((part) => part.text);

      return textParts.join("\n");
    }

    return null;
  }

  private renderAssistantMessage(message: {
    role: string;
    content: string | Array<{ type: string; text?: string }>;
  }) {
    if (typeof message.content === "string") {
      if (message.content.trim()) {
        const assistantComponent = new AssistantMessageComponent();
        assistantComponent.updateContent({
          type: "message",
          role: "assistant",
          content: message.content,
        });
        this.chatContainer.addChild(assistantComponent);
      }
    } else if (Array.isArray(message.content)) {
      const reasoningParts = message.content
        .filter(
          (part): part is { type: "reasoning"; text: string } =>
            part.type === "reasoning" &&
            typeof part.text === "string" &&
            part.text.trim().length > 0,
        )
        .map((part) => part.text)
        .join("\n");

      if (reasoningParts.trim()) {
        const thinkingComponent = new ThinkingBlockComponent(undefined, {
          verboseMode: this.verboseMode,
        });
        thinkingComponent.updateContent({ content: reasoningParts });
        thinkingComponent.endThinking();
        this.allThinkingBlocks.push(thinkingComponent);
        this.chatContainer.addChild(thinkingComponent);
      }

      const textParts = message.content
        .filter(
          (part): part is { type: "text"; text: string } =>
            part.type === "text" && part.text?.trim() !== undefined,
        )
        .map((part) => part.text)
        .join("\n");

      if (textParts.trim()) {
        const assistantComponent = new AssistantMessageComponent();
        assistantComponent.updateContent({
          type: "message",
          role: "assistant",
          content: textParts,
        });
        this.chatContainer.addChild(assistantComponent);
      }
    }
  }

  private extractToolCallsFromAssistant(
    message: {
      role: string;
      content:
        | string
        | Array<{
            type: string;
            toolName?: string;
            toolCallId?: string;
            input?: unknown;
          }>;
    },
    toolResults: Map<
      string,
      {
        toolName: string;
        outputValue: string;
        isError: boolean;
      }
    >,
  ) {
    const toolCallContents: Array<{
      toolName: string;
      toolCallId: string;
      input: unknown;
      outputValue: string;
      isError: boolean;
    }> = [];

    if (typeof message.content === "string") {
      return toolCallContents;
    }

    if (!Array.isArray(message.content)) {
      return toolCallContents;
    }

    for (const part of message.content) {
      if (part.type === "tool-call" && part.toolName && part.toolCallId) {
        const result = toolResults.get(part.toolCallId);

        if (result) {
          toolCallContents.push({
            toolName: part.toolName,
            toolCallId: part.toolCallId,
            input: part.input,
            outputValue: result.outputValue,
            isError: result.isError,
          });
        }
      }
    }

    return toolCallContents;
  }

  private createToolEvents(toolCallContent: {
    toolName: string;
    toolCallId: string;
    input: unknown;
    outputValue: string;
    isError: boolean;
  }): ToolEvent[] {
    const events: ToolEvent[] = [];

    // tool-call-start: use the tool's display function
    let startMsg = toolCallContent.toolName;
    if (this.tools && toolCallContent.toolName in this.tools) {
      const tool =
        this.tools[toolCallContent.toolName as keyof typeof this.tools];
      if ("display" in tool && typeof tool.display === "function") {
        // biome-ignore lint/suspicious/noExplicitAny: tool display expects tool-specific input
        startMsg = tool.display(toolCallContent.input as any);
      }
    }

    events.push({
      type: "tool-call-start",
      name: toolCallContent.toolName,
      toolCallId: toolCallContent.toolCallId,
      msg: startMsg,
      args: toolCallContent.input,
    });

    // tool-call-end or tool-call-error
    events.push({
      type: toolCallContent.isError ? "tool-call-error" : "tool-call-end",
      name: toolCallContent.toolName,
      toolCallId: toolCallContent.toolCallId,
      msg: toolCallContent.outputValue,
      args: toolCallContent.input,
    });

    return events;
  }

  private handleCtrlO(): void {
    this.verboseMode = !this.verboseMode;
    const modeText = this.verboseMode ? "ON" : "OFF";
    this.notification.setMessage(`Verbose mode: ${modeText}`);

    // Update all verbose-aware components to reflect new verbose mode
    for (const component of this.allThinkingBlocks) {
      component.setVerboseMode(this.verboseMode);
    }
    for (const component of this.allToolExecutions) {
      component.setVerboseMode(this.verboseMode);
    }

    this.tui.requestRender();
  }

  private async handleCtrlN(): Promise<void> {
    if (!this.options.sessionManager.isEmpty()) {
      this.options.sessionManager.setMetadata(
        "modeState",
        this.modeManager.toJson(),
      );
      await this.options.sessionManager.save();
      this.options.sessionManager.create(
        this.options.modelManager.getModel("repl").modelId,
      );
    }

    this.modeManager.reset();
    this.options.sessionManager.clearTransientMessages();
    this.options.tokenTracker.reset();

    setTerminalTitle(`acai: ${process.cwd()}`);

    this.chatContainer.clear();
    this.editor.setText("");

    // Reset footer state to clear usage/cost/steps/tools/time
    const footer = this.tui.children.find(
      (child): child is FooterComponent =>
        child.constructor.name === "FooterComponent",
    );
    if (footer) {
      footer.resetState();
    }

    this.footer.setState({
      projectStatus: this.footer.getProjectStatus(),
      currentContextWindow: 0,
      contextWindow:
        this.options.modelManager.getModelMetadata("repl").contextWindow,
      currentMode: this.modeManager.getDisplayName(),
    });

    this.tui.requestRender();
  }

  private handleCtrlD(): void {
    // Only exit if the editor is empty
    if (this.editor.getText().trim() !== "") {
      // Editor has content, do nothing
      return;
    }

    // Editor is empty - proceed with exit
    // Clear any pending notification timer
    if (this.exitNotificationTimer) {
      clearTimeout(this.exitNotificationTimer);
      this.exitNotificationTimer = undefined;
    }

    this.notification.setMessage("");
    this.tui.requestRender();

    this.options.sessionManager.setMetadata(
      "modeState",
      this.modeManager.toJson(),
    );
    void this.options.sessionManager.save();
    this.stop(true);
    process.exit(0);
  }

  private handleCtrlC(): void {
    // Handle Ctrl+C double-press logic
    const now = Date.now();
    const timeSinceLastCtrlC = now - this.lastSigintTime;
    const DoublePressThreshold = 1000; // 1 second

    if (timeSinceLastCtrlC < DoublePressThreshold) {
      // Second Ctrl+C within threshold - exit
      // Clear notification before exiting
      if (this.exitNotificationTimer) {
        clearTimeout(this.exitNotificationTimer);
        this.exitNotificationTimer = undefined;
      }
      this.notification.setMessage("");
      this.tui.requestRender();

      this.options.sessionManager.setMetadata(
        "modeState",
        this.modeManager.toJson(),
      );
      void this.options.sessionManager.save();
      this.stop(true);
      process.exit(0);
    } else {
      // First Ctrl+C - clear the editor and show notification
      this.clearEditor();
      this.notification.setMessage("Press Ctrl+C again to exit");
      this.tui.requestRender();
      this.lastSigintTime = now;

      // Clear notification after threshold if no second Ctrl+C
      if (this.exitNotificationTimer) {
        clearTimeout(this.exitNotificationTimer);
      }
      this.exitNotificationTimer = setTimeout(() => {
        if (this.isInitialized) {
          this.notification.setMessage("");
          this.exitNotificationTimer = undefined;
          this.tui.requestRender();
        }
      }, DoublePressThreshold);
    }
  }

  stop(showExitMessage = false): void {
    this.notification.setMessage("");
    // Clear any pending notification timer
    if (this.exitNotificationTimer) {
      clearTimeout(this.exitNotificationTimer);
      this.exitNotificationTimer = undefined;
    }

    if (showExitMessage && this.onExitCallback) {
      this.onExitCallback(this.options.sessionManager.getSessionId());
    }
    if (this.loadingAnimation) {
      this.loadingAnimation.stop();
      this.loadingAnimation = null;
    }
    if (this.isInitialized) {
      this.tui.stop();
      this.isInitialized = false;
    }
  }
}
