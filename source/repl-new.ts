import type { Agent, AgentEvent, AgentState } from "./agent/index.ts";
import type { CommandManager } from "./commands/manager.ts";
import type { WorkspaceContext } from "./index.ts";
import { PromptError, processPrompt } from "./mentions.ts";
import type { MessageHistory } from "./messages.ts";
import type { ModelManager } from "./models/manager.ts";
import type { PromptManager } from "./prompts/manager.ts";
import { getProjectStatusLine } from "./repl/project-status-line.ts";
import type { Terminal } from "./terminal/index.ts";
import type { TokenCounter } from "./tokens/counter.ts";
import type { TokenTracker } from "./tokens/tracker.ts";
import { AssistantMessageComponent } from "./tui/components/assistant-message.ts";
import { FooterComponent } from "./tui/components/footer.ts";
import { PromptStatusComponent } from "./tui/components/prompt-status.ts";
import { ToolExecutionComponent } from "./tui/components/tool-execution.ts";
import { Welcome } from "./tui/components/welcome.ts";
import {
  CombinedAutocompleteProvider,
  Container,
  Editor,
  Loader,
  ProcessTerminal,
  Spacer,
  TUI,
  UserMessageComponent,
} from "./tui/index.ts";

interface ReplOptions {
  agent: Agent;
  messageHistory: MessageHistory;
  promptManager: PromptManager;
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
  terminal: Terminal;
  commands: CommandManager;
  config: Record<PropertyKey, unknown>;
  tokenCounter: TokenCounter;
  promptHistory: string[];
  workspace: WorkspaceContext;
}

export class NewRepl {
  private options: ReplOptions;
  private tui: TUI;
  private welcome: Welcome;
  private editor: Editor;
  private chatContainer: Container;
  private statusContainer: Container;
  private promptStatus: PromptStatusComponent;
  private footer: FooterComponent;
  private editorContainer: Container; // Container to swap between editor and selector
  private isInitialized: boolean;
  private onInputCallback?: (text: string) => void;
  private loadingAnimation: Loader | null = null;
  private onInterruptCallback?: () => void;
  private lastSigintTime = 0;
  private isFirstUserMessage: boolean;
  private pendingTools: Map<string, ToolExecutionComponent>;

  // Streaming message tracking
  private streamingComponent: AssistantMessageComponent | null = null;

  constructor(options: ReplOptions) {
    this.options = options;
    this.tui = new TUI(new ProcessTerminal());
    this.welcome = new Welcome();
    this.editor = new Editor();
    this.chatContainer = new Container();
    this.statusContainer = new Container();
    this.editorContainer = new Container(); // Container to hold editor or selector
    this.footer = new FooterComponent(options.agent.state);
    this.promptStatus = new PromptStatusComponent(options.modelManager, {
      projectStatus: "",
      currentContextWindow: 0,
      contextWindow:
        options.modelManager.getModelMetadata("repl").contextWindow,
    });
    this.editorContainer.addChild(this.editor); // Start with editor
    this.editor.onRenderRequested = () => this.tui.requestRender();
    this.isInitialized = false;
    this.isFirstUserMessage = false;
    this.pendingTools = new Map();
  }

  async init() {
    if (this.isInitialized) {
      return;
    }
    // Setup autocomplete for file paths and slash commands
    const autocompleteProvider = new CombinedAutocompleteProvider(
      [...(await this.options.commands.getCompletions())],
      this.options.workspace.allowedDirs,
    );
    this.editor.setAutocompleteProvider(autocompleteProvider);

    const {
      promptManager,
      terminal,
      modelManager,
      messageHistory,
      commands,
      promptHistory,
    } = this.options;

    const modelConfig = modelManager.getModelMetadata("repl");
    this.promptStatus.setState({
      projectStatus: await getProjectStatusLine(),
      currentContextWindow: 0,
      contextWindow: modelConfig.contextWindow,
    });

    this.tui.addChild(this.welcome);
    this.tui.addChild(this.chatContainer);
    this.tui.addChild(this.statusContainer);
    this.tui.addChild(new Spacer(1));
    this.tui.addChild(this.footer);
    this.tui.addChild(this.editorContainer); // Use container that can hold editor or selector
    this.tui.addChild(this.promptStatus);
    this.tui.setFocus(this.editor);

    // Set up custom key handlers on the editor
    this.editor.onEscape = () => {
      // Intercept Escape key when processing
      if (this.loadingAnimation && this.onInterruptCallback) {
        this.onInterruptCallback();
      }
    };

    this.editor.onCtrlC = () => {
      this.handleCtrlC();
    };

    // Create editor for input
    this.editor.onSubmit = async (text) => {
      if (text.trim()) {
        // see if the text contains a command
        const commandResult = await commands.handle2(
          { userInput: text },
          {
            tui: this.tui,
            container: this.chatContainer,
            inputContainer: this.editorContainer,
            editor: this.editor,
          },
        );
        if (commandResult.break) {
          this.stop();
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
              terminal.error(`Prompt processing failed: ${error.message}`);
              if (
                error.cause &&
                typeof error.cause === "object" &&
                "command" in error.cause &&
                typeof error.cause.command === "string"
              ) {
                terminal.error(`Command: ${error.cause.command}`);
              }
            }
            throw error; // Re-throw other errors
          }
        } else {
          promptHistory.push(promptManager.get());
        }
        // flag to see if the user prompt has added context
        const hasAddedContext = promptManager.hasContext();

        if (hasAddedContext) {
          const contextTokenCount = promptManager.getContextTokenCount();
          terminal.info(
            `Context will be added to prompt. (${contextTokenCount} tokens)`,
          );
          terminal.lineBreak();
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
    this.footer.updateState(state);

    this.promptStatus.setState({
      projectStatus: await getProjectStatusLine(),
      currentContextWindow: state.usage.totalTokens,
      contextWindow:
        this.options.modelManager.getModelMetadata("repl").contextWindow,
    });

    switch (event.type) {
      case "agent-start":
        this.isFirstUserMessage = true;
        // Show loading animation
        this.editor.disableSubmit = true;
        // Stop old loader before clearing
        if (this.loadingAnimation) {
          this.loadingAnimation.stop();
        }
        this.statusContainer.clear();
        this.loadingAnimation = new Loader(
          this.tui,
          "Working... (esc to interrupt)",
        );
        this.statusContainer.addChild(this.loadingAnimation);
        this.tui.requestRender();
        break;

      case "step-start":
        this.isFirstUserMessage = true;
        break;

      case "message-start":
        if (event.role === "assistant") {
          // Create assistant component for streaming
          this.streamingComponent = new AssistantMessageComponent();
          this.chatContainer.addChild(this.streamingComponent);
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
          // Update streaming component with final message (includes stopReason)
          this.streamingComponent.updateContent(event);

          // Keep the streaming component - it's now the final assistant message
          this.streamingComponent = null;

          // this.addMessageToChat(event);
        }
        this.tui.requestRender();
        break;

      case "tool-call-start": {
        // Component should already exist from message_update, but create if missing
        if (!this.pendingTools.has(event.toolCallId)) {
          const component = new ToolExecutionComponent(event, "start");
          this.chatContainer.addChild(component);
          this.pendingTools.set(event.toolCallId, component);
          this.tui.requestRender();
        }
        break;
      }

      case "tool-call-end": {
        // Update the existing tool component with the result
        const component = this.pendingTools.get(event.toolCallId);
        if (component) {
          component.update(event, "done");
          this.pendingTools.delete(event.toolCallId);
          this.tui.requestRender();
        }
        break;
      }

      case "tool-call-update": {
        // Update the existing tool component with the result
        const component = this.pendingTools.get(event.toolCallId);
        if (component) {
          component.update(event, "running");
          this.tui.requestRender();
        }
        break;
      }

      case "tool-call-error": {
        // Update the existing tool component with the result
        const component = this.pendingTools.get(event.toolCallId);
        if (component) {
          component.update(event, "error");
          this.pendingTools.delete(event.toolCallId);
          this.tui.requestRender();
        }
        break;
      }

      case "agent-stop":
        // Stop loading animation
        if (this.loadingAnimation) {
          this.loadingAnimation.stop();
          this.loadingAnimation = null;
          this.statusContainer.clear();
        }
        if (this.streamingComponent) {
          this.chatContainer.removeChild(this.streamingComponent);
          this.streamingComponent = null;
        }
        // this.pendingTools.clear();
        this.editor.disableSubmit = false;
        this.tui.requestRender();
        break;
    }
  }

  private addMessageToChat(message: { role: "user"; content: string }): void {
    if (message.role === "user") {
      // Extract text content from content blocks
      const textContent = message.content;
      if (textContent) {
        const userComponent = new UserMessageComponent(
          textContent,
          this.isFirstUserMessage,
        );
        this.chatContainer.addChild(userComponent);
        this.isFirstUserMessage = false;
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

  private handleCtrlC(): void {
    // Handle Ctrl+C double-press logic
    const now = Date.now();
    const timeSinceLastCtrlC = now - this.lastSigintTime;

    if (timeSinceLastCtrlC < 500) {
      // Second Ctrl+C within 500ms - exit
      this.options.messageHistory.save();
      this.stop();
      process.exit(0);
    } else {
      // First Ctrl+C - clear the editor
      this.clearEditor();
      this.lastSigintTime = now;
    }
  }

  stop(): void {
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
