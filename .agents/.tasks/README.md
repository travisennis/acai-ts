# Task Artifacts

This directory stores task artifacts for this repository. For the full workflow, read `.agents/TASKS.md`.

Use `.agents/.tasks/index.md` as the generated queue. Create non-completed task files in `active/`, move completed task files to `completed/`, and move cancelled task files to `cancelled/`, preserving stable three-digit ids such as `001.md`. Keep task status, priority, effort, labels, ExecPlan, and dependencies in front matter so the generated indexes stay useful.

After changing task files or task front matter, regenerate indexes with:

```bash
ahm index
```

To preview which generated indexes would be rewritten, run:

```bash
ahm --dry-run index
```

Do not edit generated indexes by hand. Update task files and regenerate.
