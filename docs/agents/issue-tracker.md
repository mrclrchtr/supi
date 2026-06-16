# Issue tracker: tndm

Issues live as TNDM tickets in `.tndm/tickets/`. Use the `tndm` CLI for all operations.

## Conventions

- **Create a ticket**: `tndm ticket create "Title" -T <type> -p <priority> -s <status> -g "tag1,tag2"`
  - Types: `task`, `bug`, `feature`, `chore`, `epic`
  - Priorities: `p0`, `p1`, `p2`, `p3`, `p4`
  - Statuses: `todo`, `in_progress`, `blocked`, `done`
  - Use `--content-file <path>` for a markdown body, or `--content "<markdown>"` inline.
- **Read a ticket**: `tndm ticket show <ID>` (add `--json` for machine-readable output)
- **List tickets**: `tndm ticket list` (add `--all` to include done tickets; `--definition ready|questions|unknown` to filter by definition state)
- **Update a ticket**: `tndm ticket update <ID>` with any combination of `-s`, `-p`, `-T`, `-t`, `--add-tags`, `--remove-tags`
  - Apply tags: `tndm ticket update <ID> --add-tags "triage,needs-info"`
  - Remove tags: `tndm ticket update <ID> --remove-tags "needs-info"`
  - Close (mark done): `tndm ticket update <ID> -s done`
- **Manage tasks**: `tndm ticket task add <ID> "Task title"`, `tndm ticket task list <ID>`, `tndm ticket task complete <ID> <number>`, `tndm ticket task remove <ID> <number>`
- **Awareness**: `tndm awareness --against <git-ref>` shows relevant ticket changes elsewhere

Tickets are stored on disk under `.tndm/tickets/<TNDM-XXXXXX>/` with `meta.toml`, `state.toml`, `content.md`, and `tasks/` subdirectory.

## When a skill says "publish to the issue tracker"

Create a tndm ticket with `tndm ticket create`.

## When a skill says "fetch the relevant ticket"

Run `tndm ticket show <ID>`.
