Each project must have a `default` git test registered so `j test-branch` works. Run
`git test list` in the project — the command must match:

```
just --global-justfile _check-local-modifications && (should-skip-commit || just precommit) && just --global-justfile _check-local-modifications
```

If missing or different, generate a task to register it:

```
git test add --test default 'just --global-justfile _check-local-modifications && (should-skip-commit || just precommit) && just --global-justfile _check-local-modifications' --forget
```
