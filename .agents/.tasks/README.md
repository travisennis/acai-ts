# Task Artifacts

This directory stores task artifacts for this repository. For the full workflow, read `.agents/TASKS.md`.

Use `ahm task next`, `ahm task ready`, `ahm task list`,
`ahm task blocked`, and `ahm task show <id>` for normal queue inspection.
Use `ahm task create`, `ahm task accept`, `ahm task start`,
`ahm task complete`, and `ahm task cancel` for normal lifecycle changes.

The generated `.agents/.tasks/index.md` file is a read-only dashboard and
fallback reference. Do not edit generated indexes by hand.

If `ahm` is unavailable, create non-completed task files in `active/`, move
completed task files to `completed/`, and move cancelled task files to
`cancelled/`, preserving stable three-digit ids such as `001.md`. Keep task
status, priority, effort, labels, ExecPlan, and dependencies in front matter so
the generated indexes stay useful.

After changing task files or task front matter by hand, regenerate indexes
with:

```bash
ahm index
```

To preview which generated indexes would be rewritten, run:

```bash
ahm --dry-run index
```

A clean repository immediately after `ahm index` produces no dry-run output.

Do not edit generated indexes by hand. Update task files and regenerate only
when using the manual fallback path.
