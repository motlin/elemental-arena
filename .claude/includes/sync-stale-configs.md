Projects synced from older template versions may carry config files for tools this
template no longer uses. These conflict with the current toolchain (e.g. a leftover
config for a dropped formatter fighting the current one). In each project, scan for
configs belonging to tools the template does not use, including hidden dotfiles:
`ls -a` the project root and compare every tool config against the template's file
list; anything the template lacks is suspect.

Never delete these proactively — they may be intentional per-project choices. Instead,
alert the user: list each suspect file in the sync report and generate a task that names
the file, explains the conflict, and asks the user to confirm removal.
