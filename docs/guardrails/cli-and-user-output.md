# CLI And User Output

## Scope

Read this guardrail for CLI flags, one-shot mode, piped stdin, REPL commands,
TUI behavior, terminal rendering, markdown output, autocomplete, help text, and
copy/share/history/model commands.

## Compatibility Surfaces

- `acai` entry point, documented flags, slash commands, and stdin behavior.
- User-visible wording, command output, exit behavior, and error messages.
- Terminal width, ANSI styling, keyboard handling, modal behavior, and TUI
  layout.
- Usage docs and specs that describe command behavior.

## Required Checks

- Run focused command/TUI tests for the touched area.
- For interactive REPL behavior, use the `manual-testing` skill and run the app
  in tmux.
- Check both happy path and failure text for user-visible changes.
- Update `docs/usage.md` and README links when documented behavior changes.

## Common Failure Modes

- Breaking piped input or `-p` behavior while changing REPL flow.
- Adding output that pollutes one-shot command results.
- Assuming ASCII width equals terminal display width.
- Changing help text without updating tests or usage docs.

## Related Docs

- `docs/usage.md`
- `CONTRIBUTING.md`
- `ARCHITECTURE.md`
- `specs/cli-stdin-handling.md`
- `docs/adr/010-piped-input-handling.md`
