import fs from "node:fs/promises";
import { tool } from "ai";
import { z } from "zod";
import type { SendData } from "./types.ts";

interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

interface Relation {
  from: string;
  to: string;
  relationType: string;
}

interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

interface KnowledgeGraphOptions {
  path: string;
  sendData?: SendData;
}

class KnowledgeGraphManager {
  private memoryFilePath: string;

  constructor(options: KnowledgeGraphOptions) {
    this.memoryFilePath = options.path;
  }

  private async loadGraph(): Promise<KnowledgeGraph> {
    try {
      const data = await fs.readFile(this.memoryFilePath, "utf-8");
      const lines = data.split("\n").filter((line) => line.trim() !== "");
      return lines.reduce(
        (graph: KnowledgeGraph, line) => {
          const item = JSON.parse(line);
          if (item.type === "entity") graph.entities.push(item as Entity);
          if (item.type === "relation") graph.relations.push(item as Relation);
          return graph;
        },
        { entities: [], relations: [] },
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return { entities: [], relations: [] };
      }
      throw error;
    }
  }

  private async saveGraph(graph: KnowledgeGraph): Promise<void> {
    const lines = [
      ...graph.entities.map((e) => JSON.stringify({ type: "entity", ...e })),
      ...graph.relations.map((r) => JSON.stringify({ type: "relation", ...r })),
    ];
    await fs.writeFile(this.memoryFilePath, lines.join("\n"));
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const graph = await this.loadGraph();
    const newEntities = entities.filter(
      (e) =>
        !graph.entities.some(
          (existingEntity) => existingEntity.name === e.name,
        ),
    );
    graph.entities.push(...newEntities);
    await this.saveGraph(graph);
    return newEntities;
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const graph = await this.loadGraph();
    const newRelations = relations.filter(
      (r) =>
        !graph.relations.some(
          (existingRelation) =>
            existingRelation.from === r.from &&
            existingRelation.to === r.to &&
            existingRelation.relationType === r.relationType,
        ),
    );
    graph.relations.push(...newRelations);
    await this.saveGraph(graph);
    return newRelations;
  }

  async addObservations(
    observations: { entityName: string; contents: string[] }[],
  ): Promise<{ entityName: string; addedObservations: string[] }[]> {
    const graph = await this.loadGraph();
    const results = observations.map((o) => {
      const entity = graph.entities.find((e) => e.name === o.entityName);
      if (!entity) {
        throw new Error(`Entity with name ${o.entityName} not found`);
      }
      const newObservations = o.contents.filter(
        (content) => !entity.observations.includes(content),
      );
      entity.observations.push(...newObservations);
      return { entityName: o.entityName, addedObservations: newObservations };
    });
    await this.saveGraph(graph);
    return results;
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.entities = graph.entities.filter(
      (e) => !entityNames.includes(e.name),
    );
    graph.relations = graph.relations.filter(
      (r) => !(entityNames.includes(r.from) || entityNames.includes(r.to)),
    );
    await this.saveGraph(graph);
  }

  async deleteObservations(
    deletions: { entityName: string; observations: string[] }[],
  ): Promise<void> {
    const graph = await this.loadGraph();
    for (const d of deletions) {
      const entity = graph.entities.find((e) => e.name === d.entityName);
      if (entity) {
        entity.observations = entity.observations.filter(
          (o) => !d.observations.includes(o),
        );
      }
    }
    await this.saveGraph(graph);
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.relations = graph.relations.filter(
      (r) =>
        !relations.some(
          (delRelation) =>
            r.from === delRelation.from &&
            r.to === delRelation.to &&
            r.relationType === delRelation.relationType,
        ),
    );
    await this.saveGraph(graph);
  }

  readGraph(): Promise<KnowledgeGraph> {
    return this.loadGraph();
  }

  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    const filteredEntities = graph.entities.filter(
      (e) =>
        e.name.toLowerCase().includes(query.toLowerCase()) ||
        e.entityType.toLowerCase().includes(query.toLowerCase()) ||
        e.observations.some((o) =>
          o.toLowerCase().includes(query.toLowerCase()),
        ),
    );
    const filteredEntityNames = new Set(filteredEntities.map((e) => e.name));
    const filteredRelations = graph.relations.filter(
      (r) => filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to),
    );
    return {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  }

  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    const filteredEntities = graph.entities.filter((e) =>
      names.includes(e.name),
    );
    const filteredEntityNames = new Set(filteredEntities.map((e) => e.name));
    const filteredRelations = graph.relations.filter(
      (r) => filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to),
    );
    return {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  }
}

export const createKnowledgeGraphTools = (options: KnowledgeGraphOptions) => {
  const manager = new KnowledgeGraphManager(options);
  const { sendData } = options;

  return {
    createEntities: tool({
      description: "Create multiple new entities in the knowledge graph",
      parameters: z.object({
        entities: z.array(
          z.object({
            name: z.string().describe("The name of the entity"),
            entityType: z.string().describe("The type of the entity"),
            observations: z
              .array(z.string())
              .describe(
                "An array of observation contents associated with the entity",
              ),
          }),
        ),
      }),
      execute: async ({ entities }) => {
        sendData?.({
          event: "tool-init",
          data: `Creating ${entities.length} new entities`,
        });
        try {
          const result = await manager.createEntities(entities);
          sendData?.({
            event: "tool-completion",
            data: `Successfully created ${result.length} entities`,
          });
          return JSON.stringify(result, null, 2);
        } catch (error) {
          const errorMessage = `Error creating entities: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),

    createRelations: tool({
      description:
        "Create multiple new relations between entities in the knowledge graph",
      parameters: z.object({
        relations: z.array(
          z.object({
            from: z
              .string()
              .describe("The name of the entity where the relation starts"),
            to: z
              .string()
              .describe("The name of the entity where the relation ends"),
            relationType: z.string().describe("The type of the relation"),
          }),
        ),
      }),
      execute: async ({ relations }) => {
        sendData?.({
          event: "tool-init",
          data: `Creating ${relations.length} new relations`,
        });
        try {
          const result = await manager.createRelations(relations);
          sendData?.({
            event: "tool-completion",
            data: `Successfully created ${result.length} relations`,
          });
          return JSON.stringify(result, null, 2);
        } catch (error) {
          const errorMessage = `Error creating relations: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),

    addObservations: tool({
      description:
        "Add new observations to existing entities in the knowledge graph",
      parameters: z.object({
        observations: z.array(
          z.object({
            entityName: z
              .string()
              .describe("The name of the entity to add the observations to"),
            contents: z
              .array(z.string())
              .describe("An array of observation contents to add"),
          }),
        ),
      }),
      execute: async ({ observations }) => {
        sendData?.({
          event: "tool-init",
          data: "Adding new observations to entities",
        });
        try {
          const result = await manager.addObservations(observations);
          sendData?.({
            event: "tool-completion",
            data: `Successfully added observations to ${result.length} entities`,
          });
          return JSON.stringify(result, null, 2);
        } catch (error) {
          const errorMessage = `Error adding observations: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),

    deleteEntities: tool({
      description:
        "Delete multiple entities and their associated relations from the knowledge graph",
      parameters: z.object({
        entityNames: z
          .array(z.string())
          .describe("An array of entity names to delete"),
      }),
      execute: async ({ entityNames }) => {
        sendData?.({
          event: "tool-init",
          data: `Deleting ${entityNames.length} entities`,
        });
        try {
          await manager.deleteEntities(entityNames);
          sendData?.({
            event: "tool-completion",
            data: "Entities deleted successfully",
          });
          return "Entities deleted successfully";
        } catch (error) {
          const errorMessage = `Error deleting entities: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),

    deleteObservations: tool({
      description:
        "Delete specific observations from entities in the knowledge graph",
      parameters: z.object({
        deletions: z.array(
          z.object({
            entityName: z
              .string()
              .describe("The name of the entity containing the observations"),
            observations: z
              .array(z.string())
              .describe("An array of observations to delete"),
          }),
        ),
      }),
      execute: async ({ deletions }) => {
        sendData?.({
          event: "tool-init",
          data: "Deleting observations from entities",
        });
        try {
          await manager.deleteObservations(deletions);
          sendData?.({
            event: "tool-completion",
            data: "Observations deleted successfully",
          });
          return "Observations deleted successfully";
        } catch (error) {
          const errorMessage = `Error deleting observations: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),

    deleteRelations: tool({
      description: "Delete multiple relations from the knowledge graph",
      parameters: z.object({
        relations: z.array(
          z.object({
            from: z
              .string()
              .describe("The name of the entity where the relation starts"),
            to: z
              .string()
              .describe("The name of the entity where the relation ends"),
            relationType: z.string().describe("The type of the relation"),
          }),
        ),
      }),
      execute: async ({ relations }) => {
        sendData?.({
          event: "tool-init",
          data: `Deleting ${relations.length} relations`,
        });
        try {
          await manager.deleteRelations(relations);
          sendData?.({
            event: "tool-completion",
            data: "Relations deleted successfully",
          });
          return "Relations deleted successfully";
        } catch (error) {
          const errorMessage = `Error deleting relations: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),

    readGraph: tool({
      description: "Read the entire knowledge graph",
      parameters: z.object({}),
      execute: async () => {
        sendData?.({
          event: "tool-init",
          data: "Reading knowledge graph",
        });
        try {
          const result = await manager.readGraph();
          sendData?.({
            event: "tool-completion",
            data: "Knowledge graph read successfully",
          });
          return JSON.stringify(result, null, 2);
        } catch (error) {
          const errorMessage = `Error reading graph: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),

    searchNodes: tool({
      description: "Search for nodes in the knowledge graph based on a query",
      parameters: z.object({
        query: z
          .string()
          .describe(
            "The search query to match against entity names, types, and observation content",
          ),
      }),
      execute: async ({ query }) => {
        sendData?.({
          event: "tool-init",
          data: `Searching nodes with query: ${query}`,
        });
        try {
          const result = await manager.searchNodes(query);
          sendData?.({
            event: "tool-completion",
            data: `Found ${result.entities.length} matching entities`,
          });
          return JSON.stringify(result, null, 2);
        } catch (error) {
          const errorMessage = `Error searching nodes: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),

    openNodes: tool({
      description: "Open specific nodes in the knowledge graph by their names",
      parameters: z.object({
        names: z
          .array(z.string())
          .describe("An array of entity names to retrieve"),
      }),
      execute: async ({ names }) => {
        sendData?.({
          event: "tool-init",
          data: `Opening nodes: ${names.join(", ")}`,
        });
        try {
          const result = await manager.openNodes(names);
          sendData?.({
            event: "tool-completion",
            data: `Successfully opened ${result.entities.length} nodes`,
          });
          return JSON.stringify(result, null, 2);
        } catch (error) {
          const errorMessage = `Error opening nodes: ${(error as Error).message}`;
          sendData?.({
            event: "tool-error",
            data: errorMessage,
          });
          return errorMessage;
        }
      },
    }),
  };
};
