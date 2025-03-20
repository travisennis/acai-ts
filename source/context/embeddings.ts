import fs from "node:fs/promises";
import path from "node:path";
import { openai } from "@ai-sdk/openai";
import { embedMany } from "ai";
import { logger } from "../logger.ts";

interface EmbeddingItem {
  id: string;
  text: string;
  embedding?: number[];
}

interface SearchResult {
  id: string;
  score: number;
}

export class VectorStore {
  private dbPath: string;
  private items: Map<string, EmbeddingItem> = new Map();
  private initialized = false;
  private embeddingModel = "text-embedding-3-small" as const;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    logger.info(`Initializing vector store at ${this.dbPath}`);

    try {
      await fs.mkdir(this.dbPath, { recursive: true });

      // Try to load existing data
      try {
        const data = await fs.readFile(
          path.join(this.dbPath, "embeddings.json"),
          "utf-8",
        );

        const loadedItems = JSON.parse(data) as EmbeddingItem[];
        for (const item of loadedItems) {
          this.items.set(item.id, item);
        }

        logger.info(`Loaded ${this.items.size} embeddings`);
      } catch (error) {
        // If file doesn't exist, start with empty store
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          logger.info(
            "No existing embeddings found, starting with empty store",
          );
        } else {
          throw error;
        }
      }

      this.initialized = true;
    } catch (error) {
      logger.error({ error }, "Failed to initialize vector store");
      throw error;
    }
  }

  async updateEmbeddings(
    items: Array<{ id: string; text: string }>,
  ): Promise<void> {
    if (!this.initialized) {
      throw new Error("Vector store not initialized");
    }

    logger.debug(`Updating embeddings for ${items.length} items`);

    const itemsToEmbed: EmbeddingItem[] = [];

    for (const item of items) {
      // Check if item exists and if text has changed
      const existingItem = this.items.get(item.id);
      if (!existingItem || existingItem.text !== item.text) {
        itemsToEmbed.push(item);
      }
    }

    if (itemsToEmbed.length === 0) {
      logger.debug("No embeddings to update");
      return;
    }

    logger.info(`Generating embeddings for ${itemsToEmbed.length} items`);

    // Process in batches to avoid overloading the API
    const batchSize = 20;
    for (let i = 0; i < itemsToEmbed.length; i += batchSize) {
      const batch = itemsToEmbed.slice(i, i + batchSize);

      try {
        const { embeddings } = await embedMany({
          model: openai.embedding(this.embeddingModel),
          values: batch.map((item) => item.text),
        });

        // Update items with embeddings
        for (let j = 0; j < batch.length; j++) {
          const item = batch[j];
          const embedding = embeddings[j];

          if (item && embedding) {
            this.items.set(item.id, {
              id: item.id,
              text: item.text,
              embedding,
            });
          }
        }
      } catch (error) {
        logger.error({ error }, "Failed to generate embeddings for batch");
      }
    }

    // Persist changes
    await this.saveToFile();
  }

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    if (!this.initialized) {
      throw new Error("Vector store not initialized");
    }

    if (this.items.size === 0) {
      logger.warn("Vector store is empty, cannot perform search");
      return [];
    }

    try {
      // Generate embedding for query
      const { embeddings } = await embedMany({
        model: openai.embedding(this.embeddingModel),
        values: [query],
      });

      const queryEmbedding = embeddings[0];

      // Calculate similarity scores
      const results: SearchResult[] = [];

      // This approach is inefficient as it performs a linear search through all items.
      // More efficient alternatives:
      // 1. Use an approximate nearest neighbor (ANN) algorithm like HNSW, Annoy, or FAISS
      // 2. Implement vector quantization or clustering to reduce search space
      // 3. Create an index structure like a VP-tree or ball tree for faster similarity lookups
      // 4. Use locality-sensitive hashing (LSH) to quickly find candidate matches
      // 5. Implement a hierarchical navigable small world (HNSW) graph for sub-linear search time
      for (const [id, item] of this.items.entries()) {
        if (queryEmbedding && item.embedding) {
          const score = this.cosineSimilarity(queryEmbedding, item.embedding);
          results.push({ id, score });
        }
      }
      // Sort by similarity score (descending)
      results.sort((a, b) => b.score - a.score);

      return results.slice(0, limit);
    } catch (error) {
      logger.error({ error }, "Search failed");
      throw error;
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Vectors must have the same dimensionality");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const v1 = a[i] ?? 0;
      const v2 = b[i] ?? 0;
      dotProduct += v1 * v2;
      normA += v1 * v1;
      normB += v2 * v2;
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  private async saveToFile(): Promise<void> {
    const serializedItems = Array.from(this.items.values());

    try {
      await fs.writeFile(
        path.join(this.dbPath, "embeddings.json"),
        JSON.stringify(serializedItems),
      );
    } catch (error) {
      logger.error({ error }, "Failed to save embeddings to file");
      throw error;
    }
  }

  dispose(): void {
    this.items.clear();
    this.initialized = false;
  }
}
