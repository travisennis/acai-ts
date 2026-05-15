#!/usr/bin/env python3
"""Generate task indexes from task Markdown files."""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TASKS_DIR = ROOT / ".tasks"
ACTIVE_DIR = TASKS_DIR / "active"
COMPLETED_DIR = TASKS_DIR / "completed"

STATUS_ORDER = ["Open", "Pending", "Blocked", "Tracking", "Completed"]
PRIORITY_ORDER = {"P0": 0, "P1": 1, "P2": 2, "P3": 3, "P4": 4, "-": 99, "": 99}
MAX_READY_TASKS = 10


@dataclass(frozen=True)
class Task:
    id: str
    title: str
    status: str
    priority: str
    effort: str
    exec_plan: str
    depends_on: str
    path: Path
    bucket: str


def task_sort_key(task: Task) -> tuple[int, str]:
    match = re.match(r"(\d+)([a-z]*)$", task.id)
    if match:
        return (int(match.group(1)), match.group(2))
    return (999999, task.id)


def ready_sort_key(task: Task) -> tuple[int, int, str]:
    number, suffix = task_sort_key(task)
    return (PRIORITY_ORDER.get(task.priority, 99), number, suffix)


def parse_front_matter(text: str) -> dict[str, str]:
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---\n", 4)
    if end == -1:
        return {}
    data: dict[str, str] = {}
    for line in text[4:end].splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip().strip('"')
    return data


def parse_label(text: str, label: str) -> str | None:
    patterns = [
        rf"^\*\*{re.escape(label)}:\*\*\s*(.+?)\s*$",
        rf"^{re.escape(label)}:\s*(.+?)\s*$",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.MULTILINE)
        if match:
            return match.group(1).strip()
    return None


def parse_title(text: str, fallback_id: str) -> str:
    match = re.search(r"^#\s+(.+?)\s*$", text, re.MULTILINE)
    if not match:
        return fallback_id
    title = match.group(1).strip()
    prefixed = re.match(rf"{re.escape(fallback_id)}\s+[-]\s+(.+)$", title)
    if prefixed:
        return prefixed.group(1).strip()
    return title


def parse_task(path: Path, bucket: str) -> Task:
    text = path.read_text(encoding="utf-8")
    metadata = parse_front_matter(text)
    task_id = metadata.get("id", path.stem)
    return Task(
        id=task_id,
        title=metadata.get("title") or parse_title(text, task_id),
        status=metadata.get("status") or parse_label(text, "Status") or "-",
        priority=metadata.get("priority") or parse_label(text, "Priority") or "-",
        effort=metadata.get("effort") or parse_label(text, "Effort") or "-",
        exec_plan=metadata.get("exec_plan") or parse_label(text, "ExecPlan") or "-",
        depends_on=metadata.get("depends_on") or parse_label(text, "Depends on") or "-",
        path=path,
        bucket=bucket,
    )


def collect_tasks() -> list[Task]:
    tasks: list[Task] = []
    for bucket, directory in (("active", ACTIVE_DIR), ("completed", COMPLETED_DIR)):
        if not directory.exists():
            continue
        for path in sorted(directory.glob("*.md")):
            if path.name != "index.md":
                tasks.append(parse_task(path, bucket))
    return sorted(tasks, key=task_sort_key)


def md_link(task: Task, from_dir: Path) -> str:
    rel = task.path.relative_to(from_dir)
    return f"[{task.id}]({rel.as_posix()})"


def md_cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


def table(tasks: list[Task], from_dir: Path) -> list[str]:
    lines = [
        "| Task | Title | Status | Priority | Effort | ExecPlan | Depends on |",
        "| ---- | ----- | ------ | -------- | ------ | -------- | ---------- |",
    ]
    for task in tasks:
        lines.append(
            f"| {md_link(task, from_dir)} | {md_cell(task.title)} | {md_cell(task.status)} | "
            f"{md_cell(task.priority)} | {md_cell(task.effort)} | "
            f"{md_cell(task.exec_plan)} | {md_cell(task.depends_on)} |"
        )
    return lines


def status_counts(tasks: list[Task]) -> list[str]:
    counts = {status: 0 for status in STATUS_ORDER}
    for task in tasks:
        counts[task.status] = counts.get(task.status, 0) + 1
    lines = [f"- {status}: {counts.get(status, 0)}" for status in STATUS_ORDER]
    for status in sorted(set(counts) - set(STATUS_ORDER)):
        lines.append(f"- {status}: {counts[status]}")
    return lines


def render_root_index(tasks: list[Task]) -> str:
    active = [task for task in tasks if task.bucket == "active"]
    completed = [task for task in tasks if task.bucket == "completed"]
    ready = sorted(
        [
            task
            for task in active
            if task.status == "Pending" and task.priority in PRIORITY_ORDER and task.priority != "-"
        ],
        key=ready_sort_key,
    )
    waiting = [task for task in active if task.status in {"Blocked", "Open"}]
    trackers = [task for task in active if task.status == "Tracking"]

    lines = [
        "# Task Index",
        "",
        "This file is generated by `.agents/scripts/generate-task-indexes.py`. Do not edit it by hand.",
        "",
        "## Status Summary",
        "",
        *status_counts(tasks),
        "",
        "## How to Choose Next Work",
        "",
        "1. Prefer the lowest priority number first: P0, then P1, P2, P3, P4.",
        "2. Choose from the next ready queue unless the user names a specific task.",
        "3. Skip tasks marked `Completed`, `Blocked`, `Open`, or `Tracking`.",
        "4. Check dependencies before starting. If a dependency is incomplete, do that dependency first.",
        "5. Check the `Effort` column before implementation. `L` and `XL` tasks require an ExecPlan.",
        "",
        "## Next Ready Queue",
        "",
    ]
    if ready:
        for index, task in enumerate(ready[:MAX_READY_TASKS], start=1):
            lines.append(
                f"{index}. {md_link(task, TASKS_DIR)} - {task.title} "
                f"({task.priority}, {task.effort})"
            )
        if len(ready) > MAX_READY_TASKS:
            lines.append(
                f"\nShowing {MAX_READY_TASKS} of {len(ready)} ready tasks. "
                "See [active/index.md](active/index.md) for the full active task list."
            )
    else:
        lines.append("None.")

    lines.extend(["", "## Blocked Or Needs Triage", ""])
    lines.extend(table(sorted(waiting, key=task_sort_key), TASKS_DIR) if waiting else ["None."])

    lines.extend(["", "## Parent Trackers", ""])
    lines.extend(table(sorted(trackers, key=task_sort_key), TASKS_DIR) if trackers else ["None."])

    lines.extend(
        [
            "",
            "## Indexes",
            "",
            f"- [Active tasks](active/index.md): {len(active)}",
            f"- [Completed tasks](completed/index.md): {len(completed)}",
        ]
    )
    return "\n".join(lines) + "\n"


def render_bucket_index(title: str, description: str, tasks: list[Task], from_dir: Path) -> str:
    lines = [
        f"# {title}",
        "",
        "This file is generated by `.agents/scripts/generate-task-indexes.py`. Do not edit it by hand.",
        "",
        description,
        "",
        "## Status Summary",
        "",
        *status_counts(tasks),
        "",
        "## Tasks",
        "",
    ]
    lines.extend(table(tasks, from_dir) if tasks else ["None."])
    return "\n".join(lines) + "\n"


def desired_outputs(tasks: list[Task]) -> dict[Path, str]:
    active = [task for task in tasks if task.bucket == "active"]
    completed = [task for task in tasks if task.bucket == "completed"]
    return {
        TASKS_DIR / "index.md": render_root_index(tasks),
        ACTIVE_DIR / "index.md": render_bucket_index(
            "Active Tasks",
            "Active tasks include open, pending, blocked, and tracking work.",
            active,
            ACTIVE_DIR,
        ),
        COMPLETED_DIR / "index.md": render_bucket_index(
            "Completed Tasks",
            "Completed tasks are retained for history and stable task-id lookup.",
            completed,
            COMPLETED_DIR,
        ),
    }


def write_outputs(outputs: dict[Path, str]) -> int:
    for path, content in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    return 0


def check_outputs(outputs: dict[Path, str]) -> int:
    stale = []
    for path, content in outputs.items():
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current != content:
            stale.append(path)
    if stale:
        print("Task indexes are stale. Regenerate with the task index command.", file=sys.stderr)
        for path in stale:
            print(f"- {path.relative_to(ROOT.parent)}", file=sys.stderr)
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if generated indexes are stale")
    args = parser.parse_args()

    outputs = desired_outputs(collect_tasks())
    if args.check:
        return check_outputs(outputs)
    return write_outputs(outputs)


if __name__ == "__main__":
    raise SystemExit(main())
