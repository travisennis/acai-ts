---
id: at-6cb5
status: closed
deps: []
links: []
created: 2026-01-25T05:23:04Z
type: bug
priority: 1
assignee: Travis Ennis
---
# Editor disabled after running shell command in REPL

When a shell command is executed from the REPL, control is correctly returned to the user for entering another prompt. However, the editor becomes completely disabled and cannot be used. The user must restart the application to regain editor functionality.


## Notes

**2026-01-25T05:24:02Z**

Fixed: Added tui.setFocus(editor) to both onSelect and onCancel callbacks in source/commands/shell/index.ts. The shell command was removing the selector but not returning focus to the editor, leaving the editor in a disabled state.
