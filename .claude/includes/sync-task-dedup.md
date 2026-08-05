Create tasks in each project's `.llm/todo.md` with the markdown-tasks plugin script:

## Inventory managed files

Before changing tasks, expand the calling command's managed-file list into an explicit
inventory. Expand globs from the template with `git ls-files`; check named paths
directly so dotfiles and files missing from the target remain visible.

Classify every managed path as exactly one of:

- Identical to the template
- Intentionally different for a reason allowed by the calling command
- Out of sync and requiring a task

A dependency, hook, or migration does not implicitly cover its configuration files.
Each missing or different config remains a separate mismatch.

## Generate tasks

```bash
# Use the newest installed markdown-tasks plugin version (path rots if pinned)
TASK_ADD=$(find ~/.claude/plugins/cache/motlin-claude-code-plugins/markdown-tasks -name task_add.py | sort --version-sort | tail -1)
python3 "$TASK_ADD" ~/projects/<project>/.llm/todo.md "<task text>"
```

One task per out-of-sync file: name the file, say to match this template, and end the task
body with a `Source: <template path>` line naming this template. Tasks with prerequisites
must say so.

Stale task removal: before appending tasks to a project, delete existing unchecked task
blocks that carry this template's `Source:` marker; leave all other tasks untouched.

## Verify coverage

After generating tasks, repeat the managed-file comparison. Every mismatch must be
named by an unchecked task carrying this template's `Source:` marker. Stop and report
the sync as incomplete if a managed path is unclassified or a mismatch has no task.
