# Code Review: Ctrl-O Verbose Mode Toggle

## Overview
Implements a keyboard shortcut (Ctrl+O) to toggle verbose output mode in the TUI. When verbose mode is OFF (default), users see minimal "Thinking..." indicator and no tool output. When ON, full thinking content and truncated tool execution output are displayed.

## Code Quality & Style ✓

**Strengths:**
- Follows project conventions: TypeScript with explicit types, camelCase naming, options pattern
- Clean separation of concerns - Repl manages state, components handle rendering
- Proper use of nullish coalescing (`??`) for default values
- Consistent with existing callback pattern (`onCtrlC`, `onReconstructSession`)

## Issues & Risks

**🔴 Critical: Animation Doesn't Work**

The "Thinking..." animation in `ThinkingBlockComponent` is broken:

```typescript
this.animationFrame++;
const dots = ".".repeat((this.animationFrame % 3) + 1);
```

This code runs in the **constructor**, not on each render. The dots count will be static based on how many times the component was instantiated, not an actual animation. The animation frame counter should increment on each render cycle, not construction.

**🟡 Medium: Existing Components Don't Update**

When a user toggles verbose mode:
- Components already rendered won't update to reflect the new state
- Only newly created components will use the new verbose mode value

This means if you toggle verbose mode mid-conversation, existing thinking blocks and tool outputs won't change appearance.

**🟡 Medium: No Test Coverage**

No tests added for:
- `handleCtrlO()` method
- Verbose mode state management
- Component rendering in both modes
- Ctrl+O key handling

## Specific Suggestions

1. **Fix the animation** - Move animation logic to render cycle or use a proper animation timer
2. **Add component update method** - Allow existing components to refresh when verbose mode toggles
3. **Add tests** - Cover the new functionality
4. **Consider state persistence** - Should verbose mode persist across sessions? (currently resets on restart)

## Performance & Security

- **Performance**: Minimal impact - just boolean checks and conditional rendering
- **Security**: No concerns - purely UI state management

## Files Changed

- `source/repl.ts` - Added verbose mode state and Ctrl+O handler
- `source/terminal/control.ts` - Exported `isCtrlO`
- `source/tui/components/thinking-block.ts` - Conditional rendering based on verbose mode
- `source/tui/components/tool-execution.ts` - Conditional output display
- `source/tui/tui.ts` - Added Ctrl+O key handler and callback

## Recommendation

**Block on:** Fix the broken animation before merging. The current implementation shows static dots, not an animated "Thinking..." indicator as intended.

**Nice to have:** Add component refresh capability and tests.