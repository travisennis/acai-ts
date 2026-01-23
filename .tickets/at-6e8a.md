---
id: at-6e8a
status: open
deps: []
links: []
created: 2026-01-22T00:54:05Z
type: feature
priority: 3
assignee: Travis Ennis
---
# Add ctrl-d keymap to close app when editor is empty

Add a keymap where ctrl-d closes the app only if the repl editor is empty. ctrl-c should clear the editor and then exit. ctrl-d should only exit if the editor is clear, otherwise it does nothing.

