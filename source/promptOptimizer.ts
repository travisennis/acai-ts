import { platform } from "node:os";
import { generateText, type LanguageModel } from "ai";
import type { Terminal } from "./terminal/index.ts";
import type { TokenTracker } from "./tokenTracker.ts";
import { READ_ONLY } from "./tools/filesystem.ts";
import { GIT_READ_ONLY, inGitDirectory } from "./tools/git.ts";
import { initTools } from "./tools/index.ts";

export const metaPrompt = `
Given a basic software engineering task prompt, enhance it by addressing these key aspects:

## Context
- What is the current state of the codebase/system?
- What problem are we trying to solve?
- Are there any existing constraints or dependencies?
- Who are the stakeholders/users affected?

## Scope Definition
- What specific components/files need to be modified?
- What should explicitly remain unchanged?
- Are there related areas that might be impacted?

## Technical Requirements
- What are the functional requirements?
- What are the non-functional requirements (performance, security, accessibility, etc.)?
- Are there specific technical constraints or standards to follow?

## Acceptance Criteria
- How will we verify the changes work as intended?
- What edge cases should be considered?
- What specific metrics or benchmarks need to be met?

## Implementation Considerations
- Are there potential risks or challenges?
- What testing approach should be used?
- Are there performance implications to consider?
- What documentation needs to be updated?

The purpose of this is to generate a new prompt that can be used as set of instructions to be passed in a subsequent call to accomplish the task in the original. 

Example transformation:
<example>
Basic prompt: "Add user authentication to the app"

Enhanced prompt:
"Implement user authentication for the web application with the following considerations:

Context:
- Currently using Express.js backend with MongoDB
- Need to support both regular users and admin roles
- Must integrate with existing user profile system

Technical Requirements:
- Implement JWT-based authentication
- Support email/password and OAuth (Google, GitHub) login methods
- Include password reset functionality
- Enforce secure password policies
- Rate limit authentication attempts

Acceptance Criteria:
- Successful login redirects to user dashboard
- Failed attempts show appropriate error messages
- Sessions persist across page refreshes
- Passwords are properly hashed and salted
- All routes requiring authentication are protected

Implementation Notes:
- Consider using Passport.js for auth strategies
- Add appropriate logging for security events
- Document API endpoints and authentication flow
- Include unit tests for auth middleware
- Update API documentation with auth requirements"
</example>

You have access to tools that read the file system and git. Use this access to understand the current state of the code base to help with this task.

Use the directoryTree tool to get an overview of the project layout before trying to read files.

Your current working directory is ${process.cwd()}
Is directory a git repo: ${(await inGitDirectory()) ? "Yes" : "No"}
Platform: ${platform()}
Today's date is ${(new Date()).toISOString()}

Only return the enhanced prompt. 
`;

export async function optimizePrompt({
  model,
  prompt,
  terminal,
  tokenTracker,
}: {
  model: LanguageModel;
  prompt: string;
  terminal: Terminal;
  tokenTracker: TokenTracker;
}) {
  const { text, usage } = await generateText({
    model,
    maxTokens: 8192,
    system: metaPrompt,
    prompt: prompt,
    maxSteps: 15,
    tools: await initTools({}),
    // biome-ignore lint/style/useNamingConvention: <explanation>
    experimental_activeTools: [
      ...READ_ONLY,
      ...GIT_READ_ONLY,
      "buildCode",
      "lintCode",
    ],
  });

  terminal.info("Prompt optimized.");

  tokenTracker.trackUsage("meta-prompt", usage);

  return text;
}
