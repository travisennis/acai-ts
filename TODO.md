# TODO

## Todo


- [ ] right now the title of a session is generate from the user's first message, but if the user's first message it to tell the user to read a todo file, prompt file, etc. then the title is somethign about reading the prompt.md rather than what the prompt.md contains. perhaps a way to mitigate this very generic session title, is to use the user's first prompt and the assistants first response. this means we will set the title after the first response instead of immediately upon the users submission of their prompt, but we should get better titles
- [ ] update the select prompt in the terminal api so that the the length of each item in the list is no wider than the width of the terminal. if it is wider than then the width then the scrolling does not work. keep one item per line is cleaner, so if the string of each list item is wider than the terminal width, then it should truncate the end.
- [ ] let's add a keymap, ctrl-d, that will close the app, but only if the repl editor is empty. ctrl-c clear the editor and then exist. ctrl-d only exits if the editor is clear, otherwise it does nothing
- [ ] the handoff command should automatically reset the session, place the handoff prompt into the repl input, and allow the user to automatically continue. this means it is no longer necessary to write a handoff file and the pickup command can be removed entirely  #feat
- [ ] Use macos seatbelts and linux bubbelewrap sandboxing as seen in openai codex #feat

## In Progress

## Done

- [x] when calling the reset command the token tracker for the repl should reset. in fact, I think the entire token tracker should be reset to reflect a new session #feat

- [x] Rename all `messageHistory` variables to `sessionManager` for consistency across the codebase. The `SessionManager` class is incorrectly referenced as `messageHistory` in many places including source/cli.ts, source/repl.ts, and multiple command files. #refactor
