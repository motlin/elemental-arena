Always pin specific versions for every tool — never `latest`. Unpinned versions cause
unreproducible builds.

Every selected version must have been published for at least 24 hours. For tools managed by mise, keep `minimum_release_age = "1d"` under `[settings]` in `.mise/config.toml`, which applies when mise chooses a version; an exact pin bypasses it, so check the upstream release timestamp before pinning one. When the newest release is too young, check the immediately preceding release and repeat until one clears the 24-hour window.

Check for newer versions with mise, the single source of truth for tool versions:

```bash
mise ls-remote <tool> | tail -1
```

Compare against `.mise/config.toml` in this template. If the template is behind, update
it first, then propagate to projects.
