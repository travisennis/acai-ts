import Handlebars from "handlebars";
import { directoryTree } from "./files.js";

export const systemPrompt = `
You are acai, an AI assistant. You specialize in software development. Assume the software engineer you are working with is experienced and talented. Don't dumb things down. The goal of offering assistance is to make the best software possible. Offer useful guidance in the following areas:

1. Code Review and Suggestions
2. Documentation Assistance
3. Problem-Solving and Debugging
4. Code Generation
5. Performance Optimization
6. Testing Strategies
7. Code Refactoring
8. Code Style and Linting
9. Conventional Commits

When generating commit messages, follow the Conventional Commits standard (https://www.conventionalcommits.org/). This helps create a more readable and meaningful commit history.
  
Think through the problem step-by-step before giving your response. 

If the request is ambiguous or you need more information, ask questions. If you don't know the answer, admit you don't.

When it comes to tool use keep the following in mind:
- Carefully consider if a tool is necessary before using it.
- Always use the most appropriate tool for the task at hand.
- Ensure all required parameters are provided and valid.
- Provide detailed and clear explanations when using tools, especially for generateEdits.
- When using generateEdits and gitCommit always confirm with the user before proceeding.

Provide answers in markdown format unless instructed otherwise. 
`;

export type UserPromptContext = {
  fileTree?: string;
  files?: { path: string; content: string }[];
  urlContent?: { url: string; content: string }[];
  prompt?: string;
};

export class PromptManager {
  private fileMap: Map<string, string>;
  private filesUpdated = false;

  private urlContent: Map<string, string>;
  private urlUpdated = false;

  constructor() {
    this.fileMap = new Map<string, string>();
    this.urlContent = new Map<string, string>();
  }

  addFile(fileName: string, content: string) {
    this.fileMap.set(fileName, content);
    this.filesUpdated = true;
  }

  addUrl(url: string, content: string) {
    this.urlContent.set(url, content);
    this.urlUpdated = true;
  }

  getFiles() {
    const files = Array.from(this.fileMap, ([path, content]) => ({
      path,
      content,
    }));
    return files;
  }

  getUrls() {
    const urls = Array.from(this.urlContent, ([url, content]) => ({
      url,
      content,
    }));
    return urls;
  }

  async getPrompt(prompt: string) {
    const context: UserPromptContext = { prompt };
    let useCachePrompt = false;
    if (this.filesUpdated) {
      context.fileTree = await directoryTree(process.cwd());
      context.files = this.getFiles();
      this.filesUpdated = false;
      useCachePrompt = true;
    }
    if (this.urlUpdated) {
      context.urlContent = this.getUrls();
      this.urlUpdated = false;
      useCachePrompt = true;
    }

    return {
      prompt: userPromptTemplate(context),
      useCache: useCachePrompt,
    };
  }
}

export const userPromptTemplate = Handlebars.compile<UserPromptContext>(
  `
{{#if fileTree}}
File Tree:

{{fileTree}}

{{/if}}
{{#if files}}
File Contents:

{{/if}}
{{#each files}}
	{{#if path}}
File: {{path}}

	{{/if}}
  {{#if content}}
{{content}}
	{{/if}}

---

{{/each}}
{{#if prompt}}
	{{#if context}}
"""
	{{/if}}
{{/if}}
{{#if context}}
{{context}}
{{/if}}
{{#if prompt}}
	{{#if context}}
"""
	{{/if}}
{{/if}}
{{#if urlContent}}
Context:

{{#each urlContent}}
url: {{url}}

{{content}}

{{/each}}
{{/if}}
{{#if prompt}}
{{prompt}}
{{/if}}
`,
  {
    noEscape: true,
  },
);
