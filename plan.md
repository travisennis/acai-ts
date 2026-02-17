# Fix Tool Execution Component Spacing

## Summary

Remove leading/trailing spacers from chat-related components (`ToolExecutionComponent`, `UserMessageComponent`, `AssistantMessageComponent`) and delegate spacing to the REPL, which will add a single `Spacer(1)` between each component added to the chat container.

## Problem

When multiple tools are called in parallel, the `ToolExecutionComponent` adds spacers both before and after itself (2 at top, 2 at bottom). When consecutive tool components are rendered, the trailing spacer of one and leading spacer of the next combine, creating double spacing between tools.

## Files to Modify

### 1. `source/tui/components/tool-execution.ts`
- Remove lines 55-56: `this.contentContainer.addChild(new Spacer(1))` and `this.contentContainer.addChild(new Spacer(1, bgColor))` (top spacers)
- Remove lines 88-89: `this.contentContainer.addChild(new Spacer(1, bgColor))` and `this.contentContainer.addChild(new Spacer(1))` (bottom spacers)
- Keep internal spacing between events within the component

### 2. `source/tui/components/user-message.ts`
- Remove line 14: `this.addChild(new Spacer(1))` (leading spacer)
- Remove line 26: `this.addChild(new Spacer(1))` (trailing spacer)

### 3. `source/tui/components/assistant-message.ts`
- Remove line 36: `this.contentContainer.addChild(new Spacer(1))` (leading spacer - only added when content exists)

### 4. `source/repl.ts`
Add a helper method `addComponentWithSpacing(component: Component)` that adds a Spacer(1) before the component (except for the first component), then call this instead of `chatContainer.addChild()` at all these locations:
- Line 318: context token info Text
- Line 420: streaming assistant message component
- Line 463: tool execution component (tool-call-lifecycle)
- Line 524: thinking block component
- Line 558: user message (addMessageToChat)
- Line 696: user message (reconstructSession)
- Line 718: tool execution component (reconstructSession)
- Line 768: assistant message (renderAssistantMessage)
- Line 788: thinking block (renderAssistantMessage)
- Line 806: assistant message (renderAssistantMessage)

## Implementation Approach

1. Create a private method in REPL class:
   ```typescript
   private addComponentWithSpacing(component: Component): void {
     if (!this.chatContainer.isEmpty()) {
       this.chatContainer.addChild(new Spacer(1));
     }
     this.chatContainer.addChild(component);
   }
   ```

2. Replace all `this.chatContainer.addChild(...)` calls for chat components with `this.addComponentWithSpacing(...)`

3. Remove spacers from the three component files

## Out of Scope

- Modifying other Spacer usages in the codebase (command outputs, modals, etc.)
- Changing vertical spacing within components (e.g., between events in ToolExecutionComponent)
- Changes to editor or footer areas

## Success Criteria

### Automated Verification
- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` passes

### Manual Verification
- Run REPL with a prompt that triggers multiple parallel tool calls
- Verify exactly one blank line between consecutive tool execution components
- Verify exactly one blank line between user message and tool, and between tool and assistant message
- Verify components render flush at top when chat is empty
- Verify all existing functionality (message rendering, thinking blocks, tool output display) still works correctly
