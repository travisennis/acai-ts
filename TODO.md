# TODO

## Todo

- [ ] the handoff command should automatically reset the session, place the handoff prompt into the repl input, and allow the user to automatically continue. this means it is no longer necessary to write a handoff file and the pickup command can be removed entirely  #feat
- [ ] Use macos seatbelts and linux bubbelewrap sandboxing as seen in openai codex #feat

## In Progress

## Done

- [x] when calling the reset command the token tracker for the repl should reset. in fact, I think the entire token tracker should be reset to reflect a new session #feat

- [x] Rename all `messageHistory` variables to `sessionManager` for consistency across the codebase. The `SessionManager` class is incorrectly referenced as `messageHistory` in many places including source/cli.ts, source/repl.ts, and multiple command files. #refactor
