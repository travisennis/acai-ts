1. Project configuration - There's a `readProjectConfig` function in config.ts that reads from an `.acai/acai.json` file, but there doesn't seem to be a command or interface to create/modify this config.

2. Rules file support - There's a `readRulesFile` function to read from `.acai/rules.md`, but no clear way to create or manage these rules.

3. Model switching - While there's support for different models through flags, there's no interactive command to switch models during a session.

4. Workspace/project management - The code can read files and configuration, but doesn't have a clear concept of "projects" or "workspaces".

5. Caching/history browsing - While message history is saved, there doesn't seem to be a way to browse or search through past conversations.

6. Plugins or extensions - The architecture might support this but it's not explicitly implemented.

7. Advanced file retrieval - The file retrieval logic is there but could be expanded with more intelligence.

8. Advanced error handling and recovery - Basic error handling exists but could be enhanced.

9. Better visualization of token usage and limits - Token tracking exists but visualization could be improved.

10. Context windowing or auto-summarization - There's basic support for compacting history, but no automatic management of context windows.
