# Notification Auto-Dismiss Feature

## Summary
Add auto-dismiss functionality to `NotificationComponent` so transient notifications (like "Verbose mode: ON") automatically disappear after a configurable timeout. Default is 3 seconds, with ability to override per-notification.

## Changes

### `source/tui/components/notification.ts`

1. Add import for `NodeJS` timeout types
2. Add private fields:
   - `private autoDismissTimer?: NodeJS.Timeout;`
   - `private autoDismissMs: number;` (default timeout in ms)
3. Update constructor to accept optional `autoDismissMs` parameter (default 3000ms)
4. Add `setAutoDismissMs(ms: number): void` method to override default
5. Modify `setMessage()`:
   - If message is empty (`""`), clear any pending timer immediately (no auto-dismiss needed)
   - If message is non-empty:
     - Clear existing timer first (handles Option A - reset on new notification)
     - Start new `setTimeout` for `autoDismissMs` duration
     - On timeout: set message to `""` and invalidate cache
6. Add private method `clearTimer()` to centralize timer cleanup
7. Add public method `clear()` to allow external clearing if needed

### `source/repl.ts`

1. Line 164-167: Pass `autoDismissMs: 1000` to constructor (preserves Ctrl+C notification behavior)
2. All other `notification.setMessage()` calls will use default 3-second timeout
3. Any notification needing different timing can call `notification.setAutoDismissMs(ms)` before `setMessage()`

## API

```typescript
// NotificationComponent constructor
new NotificationComponent(
  message = "",
  bgColor = { r: 64, g: 64, b: 64 },
  textStyle = style.yellow,
  paddingX = 1,
  autoDismissMs = 3000  // NEW: default 3 seconds
)

// Methods
setMessage(message: string): void  // auto-dismisses after autoDismissMs
setAutoDismissMs(ms: number): void // override for next setMessage call
clear(): void                      // immediate clear, cancels timer
```

## Out of Scope
- User-configurable timeout via settings file
- Different default timeouts for different notification types beyond Ctrl+C
- Animation/fade effects on dismiss

## Success Criteria

### Automated verification
- [x] `npm run typecheck` passes
- [x] `npm run lint` passes  
- [x] `npm run build` passes

### Manual verification
- [x] Toggle verbose mode (Ctrl+O): "Verbose mode: ON/OFF" appears for 3 seconds then disappears
- [x] Press Ctrl+C once: "Press Ctrl+C again to exit" appears for 1 second then disappears
- [x] Rapidly toggle verbose mode: timer resets each time, notification stays until final 3-second countdown ends
- [ ] Trigger auto-generated rules: notification appears for 3 seconds then disappears
- [x] Exit app: no pending timers left behind
