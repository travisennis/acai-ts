# Modes Feature - Implementation Progress

## Phase 1: Create ModeManager and Mode Definitions
- [ ] Create `source/modes/manager.ts`
- [ ] TypeScript compiles
- [ ] Linting passes

## Phase 2: Add Shift+Tab Handler to TUI and Repl
- [ ] Add `onShiftTab` callback to TUI
- [ ] Import `isShiftTab` in TUI
- [ ] Connect to ModeManager in Repl
- [ ] TypeScript compiles
- [ ] Linting passes

## Phase 3: Mode Context Injection + Transient Messages
- [ ] Add transient message support to SessionManager
- [ ] Inject mode context in Repl submission flow
- [ ] TypeScript compiles
- [ ] Linting passes

## Phase 4: Footer Mode Indicator
- [ ] Add currentMode to Footer state
- [ ] Render mode indicator on git line
- [ ] Pass currentMode from Repl
- [ ] TypeScript compiles
- [ ] Linting passes

## Phase 5: Session Persistence
- [ ] Add metadata to SavedMessageHistory
- [ ] Add metadata support to SessionManager
- [ ] Sync mode state in Repl
- [ ] TypeScript compiles
- [ ] Linting passes

## Phase 6: Ctrl+N Reset
- [ ] Reset mode on Ctrl+N
- [ ] Clear transient messages
- [ ] TypeScript compiles
- [ ] Linting passes
