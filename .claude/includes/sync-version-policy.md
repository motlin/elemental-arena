Always pin specific versions for every tool — never `latest`. Unpinned versions cause
unreproducible builds.

Check for newer versions with mise, the single source of truth for tool versions:

```bash
mise ls-remote <tool> | tail -1
```

Compare against `.mise/config.toml` in this template. If the template is behind, update
it first, then propagate to projects.
