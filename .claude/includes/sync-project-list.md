Read the project list from `.llm/projects.yaml`. This file is gitignored so each machine
configures its own projects.

```yaml
# Projects synced from this template
own:
    - ~/projects/my-project-1
    - ~/projects/my-project-2

# Forks — sync carefully, preserve upstream-specific config
forks:
    - ~/projects/some-fork

# Nested projects (templates/archetypes embedded in a parent project), if any
nested:
    - ~/projects/my-project/my-archetype/src/main/resources/archetype-resources
```
