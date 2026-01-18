import type {
  Agent,
  AgentEvent,
  AgentState,
  ToolEvent,
} from "./agent/index.ts";
import type { CommandManager } from "./commands/manager.ts";
import type { WorkspaceContext } from "./index.ts";
import { logger } from "./logger.ts";
import { PromptError, processPrompt } from "./mentions.ts";
import type { ModelManager } from "./models/manager.ts";
import type { PromptManager } from "./prompts/manager.ts";
import {
  getProjectStatus,
  type ProjectStatusData,
} from "./repl/project-status.ts";
import type { SessionManager } from "./sessions/manager.ts";
import { alert, startProgress, stopProgress } from "./terminal/control.ts";
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
  messageHistory: SessionManager;
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

export class NewRepl {
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
    this.footer = new FooterComponent(options.modelManager, {
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
      usage: this.options.tokenTracker.getUsageByApp("repl"),
    });
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
      messageHistory,
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
      usage: this.options.tokenTracker.getUsageByApp("repl"),
    });

    this.tui.onCtrlC = () => {
      this.handleCtrlC();
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
          try {
            const processedPrompt = await processPrompt(text, {
              baseDir: process.cwd(),
              model: modelConfig,
            });
            for (const context of processedPrompt.context) {
              promptManager.addContext(context);
            }
            promptManager.set(processedPrompt.message);
          } catch (error) {
            if (error instanceof PromptError) {
              this.chatContainer.addChild(
                new Text(
                  style.red(`Prompt processing failed: ${error.message}`),
                  1,
                  1,
                ),
              );
              if (
                error.cause &&
                typeof error.cause === "object" &&
                "command" in error.cause &&
                typeof error.cause.command === "string"
              ) {
                this.chatContainer.addChild(
                  new Text(style.red(`Command: ${error.cause.command}`, 1, 1)),
                );
              }
            }
            throw error; // Re-throw other errors
          }
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

        messageHistory.appendUserMessage(userMsg);

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
      currentContextWindow: this.options.messageHistory.getContextWindow(),
      contextWindow:
        this.options.modelManager.getModelMetadata("repl").contextWindow,
      agentState: state,
      usage: this.options.tokenTracker.getUsageByApp("repl"),
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
          const newComponent = new ToolExecutionComponent(event.events);
          this.pendingTools.set(event.toolCallId, newComponent);
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
        this.tui.requestRender();
        break;

      case "agent-error":
        logger.error(event, "agent-error");
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
        const component = new ThinkingBlockComponent();
        this.thinkingBlockComponent = component;
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
          this.thinkingBlockComponent.updateContent(event);

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
    this.footer.setState({
      projectStatus: await getProjectStatus(),
      currentContextWindow: this.options.messageHistory.getContextWindow(),
      contextWindow:
        this.options.modelManager.getModelMetadata("repl").contextWindow,
      usage: this.options.tokenTracker.getUsageByApp("repl"),
    });

    // Reconstruct entire session display from messages
    this.reconstructSession();

    this.tui.requestRender();
  }

  private reconstructSession() {
    // Clear existing display
    this.pendingTools.clear();
    this.chatContainer.clear();

    // Get session messages
    const messages = this.options.messageHistory.get();

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
            const component = new ToolExecutionComponent(events);
            this.pendingTools.set(toolCallId, component);
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

      void this.options.messageHistory.save();
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
      this.onExitCallback(this.options.messageHistory.getSessionId());
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
