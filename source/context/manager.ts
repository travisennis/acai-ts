import { EventEmitter } from "node:events";
import path from "node:path";
import { config } from "../config.ts";
import { logger } from "../logger.ts";
import { CodeAnalyzer } from "./code-analyzer.ts";
import { VectorStore } from "./embeddings.ts";
import { GitAnalyzer } from "./git-analyzer.ts";
import { ContextGraph } from "./graph.ts";

export interface ContextOptions {
  projectRoot: string;
  refreshInterval?: number; // in milliseconds
  maxHistoryDepth?: number; // how many commits back to analyze
}

interface ContextManagerEvents {
  initialized: [];
  analysisCompleted: [];
  disposed: [];
}

export interface Entity {
  id: string;
  type: string;
  description?: string;
  content?: string;
  metadata: Record<string, any>;
  relationships: Array<{
    type: string;
    targetId: string;
  }>;
}

export class ContextManager extends EventEmitter<ContextManagerEvents> {
  private projectRoot: string;
  private graph: ContextGraph;
  private gitAnalyzer: GitAnalyzer;
  private codeAnalyzer: CodeAnalyzer;
  private vectorStore: VectorStore;
  private refreshTimer: NodeJS.Timeout | null = null;
  isInitialized = false;

  constructor(options: ContextOptions) {
    super();
    this.projectRoot = options.projectRoot;

    const contextDir = config.app.ensurePath("context");
    const dataDir = path.join(
      contextDir,
      Buffer.from(this.projectRoot).toString("base64url"),
    );

    this.graph = new ContextGraph(path.join(dataDir, "graph"));
    this.vectorStore = new VectorStore(path.join(dataDir, "vectors"));
    this.gitAnalyzer = new GitAnalyzer({
      projectRoot: this.projectRoot,
      maxHistoryDepth: options.maxHistoryDepth ?? 100,
    });
    this.codeAnalyzer = new CodeAnalyzer(this.projectRoot);

    if (options.refreshInterval) {
      this.startRefreshTimer(options.refreshInterval);
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    logger.info(`Initializing context manager for ${this.projectRoot}`);

    try {
      await this.gitAnalyzer.initialize();
      this.codeAnalyzer.initialize();
      await this.graph.initialize();
      await this.vectorStore.initialize();

      // Perform initial analysis
      await this.performFullAnalysis();

      this.isInitialized = true;
      this.emit("initialized");
      logger.info("Context manager initialized successfully");
    } catch (error) {
      logger.error({ error }, "Failed to initialize context manager");
      throw error;
    }
  }

  async performFullAnalysis(): Promise<void> {
    logger.info("Starting full context analysis");

    // Analyze git history
    const gitEntities = await this.gitAnalyzer.analyzeHistory();

    // Analyze code structure
    const codeEntities = await this.codeAnalyzer.analyzeProject();

    // Update graph with new entities
    await this.graph.addEntities([...gitEntities, ...codeEntities]);

    // Update vector embeddings
    await this.vectorStore.updateEmbeddings([
      ...gitEntities.map((e) => ({ id: e.id, text: e.description || "" })),
      ...codeEntities.map((e) => ({ id: e.id, text: e.content || "" })),
    ]);

    logger.info("Full context analysis completed");
    this.emit("analysisCompleted");
  }

  async enrichPrompt(prompt: string): Promise<string> {
    if (!this.isInitialized) {
      logger.warn("Context manager not initialized, returning original prompt");
      return prompt;
    }

    // Find relevant context for the prompt
    const relevantDocs = await this.vectorStore.search(prompt, 5);
    const relevantIds = relevantDocs.map((doc) => doc.id);

    // Get connected entities from graph
    const connectedEntities =
      await this.graph.getConnectedEntities(relevantIds);

    // Format context to include in prompt
    const contextBlock = this.formatContextForPrompt(connectedEntities);

    return `${contextBlock}\n\n${prompt}`;
  }

  private formatContextForPrompt(entities: Entity[]): string {
    // Format entities into a context block
    const contextParts = entities.map((entity) => {
      return `${entity.type}: ${entity.id}\n${entity.description || entity.content || ""}`;
    });

    return `Project Context:\n${contextParts.join("\n\n")}`;
  }

  private startRefreshTimer(interval: number): void {
    this.refreshTimer = setInterval(() => {
      this.performIncrementalUpdate().catch((error) => {
        logger.error({ error }, "Failed to perform incremental update");
      });
    }, interval);
  }

  async performIncrementalUpdate(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    logger.debug("Starting incremental context update");

    // Get recent changes
    const recentGitChanges = await this.gitAnalyzer.getRecentChanges();
    const changedFiles = recentGitChanges.flatMap((change) =>
      change.relationships
        .filter((r) => r.targetId.startsWith("file:"))
        .map((e) => e.targetId.replace("file:", "")),
    );

    // Only analyze files that have changed
    const codeEntities = await this.codeAnalyzer.analyzeFiles(changedFiles);

    // Update graph and vector store
    await this.graph.updateEntities([...recentGitChanges, ...codeEntities]);
    await this.vectorStore.updateEmbeddings([
      ...recentGitChanges.map((e) => ({ id: e.id, text: e.description || "" })),
      ...codeEntities.map((e) => ({ id: e.id, text: e.content || "" })),
    ]);

    logger.debug("Incremental context update completed");
  }

  async query(question: string): Promise<Entity[]> {
    if (!this.isInitialized) {
      throw new Error("Context manager not initialized");
    }

    // Search for relevant context
    const relevantDocs = await this.vectorStore.search(question, 10);
    const relevantIds = relevantDocs.map((doc) => doc.id);

    // Get connected entities from graph
    return this.graph.getConnectedEntities(relevantIds);
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.graph.dispose();
    this.vectorStore.dispose();
    this.isInitialized = false;
    this.emit("disposed");
  }
}
