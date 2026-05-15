# Task Artifacts

This directory stores task artifacts for acai-ts. For the full workflow, read `.agents/TASKS.md`.

Use `.agents/.tasks/index.md` as the generated queue. Create non-completed task files in `active/` and move completed task files to `completed/`, preserving stable three-digit ids such as `001.md`.

After changing task files or task front matter, regenerate indexes with:

```bash
npm run task-index
```

This wraps `python3 .agents/scripts/generate-task-indexes.py`.
