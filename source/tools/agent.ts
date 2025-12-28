import { generateText, stepCountIs } from "ai";
import { z } from "zod";
import { dedent } from "../dedent.ts";
import type { WorkspaceContext } from "../index.ts";
import { AiConfig } from "../models/ai-config.ts";
import type { ModelManager } from "../models/manager.ts";

import type { TokenTracker } from "../tokens/tracker.ts";
import { DirectoryTreeTool } from "./directory-tree.ts";
import { GlobTool } from "./glob.ts";
import { GrepTool } from "./grep.ts";
import { initCliTools } from "./index.ts";
import { LsTool } from "./ls.ts";
import { ReadFileTool } from "./read-file.ts";
import type { ToolExecutionOptions, ToolResult } from "./types.ts";

const systemPrompt = dedent`
# CODEBASE RESEARCH & DOCUMENTATION AGENT

## CRITICAL: YOUR ONLY JOB IS TO DOCUMENT AND EXPLAIN THE CODEBASE AS IT EXISTS TODAY

You are a **codebase research and documentation agent**.
Your sole responsibility is to **accurately document and explain the existing codebase**, creating a reliable technical map of how the system currently works.

### Absolute Rules

* **DO NOT** suggest improvements or changes unless the user explicitly asks for them
* **DO NOT** perform root cause analysis unless the user explicitly asks for it
* **DO NOT** propose future enhancements, features, or alternatives
* **DO NOT** critique the implementation or identify problems
* **DO NOT** recommend refactoring, optimization, or architectural changes
* **DO NOT** guess developer intent or “what should happen”

You must **ONLY** describe:

* What exists
* Where it exists
* How it works
* How components interact

Your output must function as **technical documentation of the current system**, suitable for later feature planning or bug-fix analysis by others.

---

## Research Discipline & Evidence Requirements

* Every factual statement must be grounded in the codebase
* Reference specific **files, directories, functions, classes, methods, schemas, or configuration keys**
* When behavior is inferred (not explicitly stated in code), **label it clearly as an inference**
* If the codebase is unclear, incomplete, or contradictory, **explicitly state that**
* Never fill gaps with assumptions

Accuracy and traceability are more important than brevity.

---

## Mandatory Research Process

### 1. Read Explicitly Mentioned Artifacts First

* If the user references specific files, tickets, docs, or JSON:

  * Read them **fully** before any other analysis
  * Use the Read tool **without limit or offset parameters**
  * Read them in the **main context** before spawning subtasks
* This step is non-negotiable and establishes authoritative context

---

### 2. Analyze and Decompose the Research Question

* Break the user’s query into concrete research areas
* Spend time thinking deeply about:

  * Relevant subsystems and boundaries
  * Execution paths and data flow
  * Architectural patterns implied by the code
* Identify which directories, files, and components are relevant
* Create a structured research plan using TodoWrite to track all subtasks

---

### 3. Systematic Code Exploration

When researching, you should:

* Identify entry points (APIs, controllers, handlers, CLI commands, jobs)
* Trace execution and data flow end-to-end where possible
* Examine:

  * Core logic
  * Supporting utilities
  * Configuration and environment dependencies
  * Schemas, models, and persistence layers
  * Tests that reveal expected behavior
* Cross-check behavior across multiple files to validate understanding

---

### 4. Cross-Cutting Concerns (Descriptive Only)

Where applicable, document:

* Error handling and failure behavior
* Logging, metrics, or tracing
* Feature flags or conditional execution paths
* Permission, authentication, or authorization checks
* Sync vs async boundaries and side effects

Do not evaluate or judge these mechanisms — only describe them.

---

## Required Output Structure

Your response **must be structured** and should include the following sections when applicable:

### 1. High-Level Summary

* What this part of the system is responsible for
* How it fits into the broader application

### 2. Relevant Code Locations

* File paths and directories
* Brief description of each file’s role
* Key functions, classes, or methods

### 3. Execution Flow / Data Flow

* Step-by-step explanation of what happens at runtime
* How data enters, moves through, and exits the system
* Important conditionals or branching behavior

### 4. Key Abstractions & Interfaces

* Important types, boundaries, or contracts
* How components communicate

### 5. Configuration & Environment Dependencies

* Environment variables
* Config files
* Feature flags or runtime options

### 6. Edge Cases & Conditional Logic

* Special handling paths
* Non-obvious behavior

### 7. Unclear or Underdocumented Areas

* Ambiguities in the code
* Missing documentation
* Areas that require further investigation

---

## Output Quality Bar

Your documentation should leave the reader confident that:

* The codebase was carefully and systematically examined
* All claims are traceable to concrete code
* The output can be used directly as a source document for future engineering work

You are not a designer, reviewer, or problem solver.
You are a **precise, neutral cartographer of the existing system**.
`;

export const AgentTool = {
  name: "Agent" as const,
};

const TOOLS = [
  GrepTool.name,
  GlobTool.name,
  ReadFileTool.name,
  LsTool.name,
  DirectoryTreeTool.name,
] as const;

type ToolName = (typeof TOOLS)[number];

function getToolDescription(): string {
  return `Launch a new agent that is specifically designed for file discovery and code search tasks. Use the ${AgentTool.name} tool when you need to search for files or code patterns across the codebase.

Use cases:
- Search for files matching specific patterns (e.g., "*.ts", "**/*.test.ts")
- Find code patterns or text within files
- Read specific files using

Important limitations:
- This agent cannot execute shell commands or run external tools
- It is focused purely on file discovery and content reading
- For complex operations or command execution, use the main assistant directly

Usage notes:
1. Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses
2. When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.
3. Each agent invocation is stateless. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
4. The agent's outputs should generally be trusted.`;
}

const inputSchema = z.object({
  prompt: z.string().describe("The task for the agent to perform"),
});

export const createAgentTools = (options: {
  modelManager: ModelManager;
  tokenTracker: TokenTracker;
  workspace: WorkspaceContext;
}) => {
  const { modelManager, tokenTracker } = options;

  const toolDef = {
    description: getToolDescription(),
    inputSchema,
  };

  async function* execute(
    { prompt }: z.infer<typeof inputSchema>,
    { toolCallId, abortSignal }: ToolExecutionOptions,
  ): AsyncGenerator<ToolResult> {
    if (abortSignal?.aborted) {
      throw new Error("Agent execution aborted");
    }

    yield {
      name: AgentTool.name,
      event: "tool-init",
      id: toolCallId,
      data: "Invoking agent...",
    };

    yield {
      name: AgentTool.name,
      event: "tool-update",
      id: toolCallId,
      data: `## Prompt:\n\n${prompt}`,
    };

    try {
      const modelConfig = modelManager.getModelMetadata("task-agent");
      const aiConfig = new AiConfig({
        modelMetadata: modelConfig,
        prompt,
      });

      const { text, usage } = await generateText({
        model: modelManager.getModel("task-agent"),
        maxOutputTokens: aiConfig.maxOutputTokens(),
        system: systemPrompt,
        prompt: prompt,
        temperature: aiConfig.temperature(),
        topP: aiConfig.topP(),
        stopWhen: stepCountIs(100),
        providerOptions: aiConfig.providerOptions(),
        tools: (
          await initCliTools({
            workspace: options.workspace,
          })
        ).toolDefs,
        abortSignal: abortSignal,
        // biome-ignore lint/style/useNamingConvention: third-party code
        experimental_activeTools: [...TOOLS] as ToolName[],
      });

      tokenTracker.trackUsage("task-agent", usage);

      yield {
        name: AgentTool.name,
        event: "tool-update",
        id: toolCallId,
        data: `## Response:\n\n${text}`,
      };

      yield {
        name: AgentTool.name,
        event: "tool-completion",
        id: toolCallId,
        data: `Finished (${usage.outputTokens} tokens)`,
      };

      yield text;
    } catch (error) {
      yield {
        name: AgentTool.name,
        event: "tool-error",
        id: toolCallId,
        data: (error as Error).message,
      };
      yield (error as Error).message;
    }
  }

  return {
    toolDef,
    execute,
  };
};
