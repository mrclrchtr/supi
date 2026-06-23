# Issue tracker: tndm

Issues live as TNDM tickets in `.tndm/tickets/`. Use the `tndm` CLI for all operations.
`.tndm/tickets/<<ID>>/` contains `meta.toml`, `state.toml`, `content.md`, and optional `tasks/` subdirectory.

> If multiple tickets are required, create them one by one.
> Do not write scripts - use the CLI and edit the ticket files directly.
> You don't need to investigate existing tickets unless there is a reason to do so.

## CLI

- ID format: `TNDM-XXXXXX`
- `tndm ticket create "Title"` (returns ID)
    - `-T <type>` (`task`, `bug`, `feature`, `chore`, `epic`)
    - `-p <priority>` (`p0`, `p1`, `p2`, `p3`, `p4`)
    - `-s <status>` (`todo`, `in_progress`, `blocked`, `done`)
    - `-g "tag1,tag2"`
    - `--depends-on "<ID-1>,<ID-2>`
    - `--effort xs|s|m|l|xl`
    - Directly edit `content.md` in `.tndm/tickets/<ID>/` (preferred) or use `--content-file <path>` to pipe an MD file
- `tndm ticket show <ID>`
- `tndm ticket list`
    - `--all` include `done` (avoid)
    - `--definition ready|questions|unknown` filter state
- `tndm ticket update <ID>` with any combination of `-s`, `-p`, `-T`, `-t`, `--add-tags`, `--remove-tags`, `--depends-on`, `--effort`, `--content`, `--content-file`
- `tndm ticket task add <ID> --title "Task title"`
- `tndm ticket task list <ID>`
- `tndm ticket task complete <ID> <number>`
- `tndm ticket task remove <ID> <number>`

Use `--json` for machine-readable output.

## Task detail documents

For AFK-ready tickets, every task must have a populated `tasks/task-<NN>.md` detail document.
Prefer no tasks on a small/medium ticket over title-only tasks - title-only tasks are not acceptable.

Edit `tasks/task-<NN>.md` with:

```md
# Task N: Title

**Description:**

- The goal of the task / what to achieve, with inline code examples where helpful
- Should be as concise as possible but comprehensive as required

**Files:** (optional)

- `path/to/file.ts` — what to change, with inline code examples where helpful

**Acceptance criteria:**

- Expected output
- Commands to run
- Edge cases
- Specific, falsifiable checks
```

Use tasks for execution sequencing/checkpoints with exact instructions and code examples where helpful.

## When a skill says "publish to the issue tracker"

- Determine the issue effort (`xs|s|m|l|xl`).
- Create a tndm ticket: `tndm ticket create "Title"`.
- If the ticket is intended for AFK agents, add implementation tasks unless the ticket is `xs` or `s`.
- If you add tasks, fill every generated `tasks/task-<NN>.md` detail document. Do not leave title-only tasks.
- After editing `content.md` or task docs directly, run `tndm ticket sync <ID>`.

Before reporting published tickets, verify:

- [ ] `content.md` is populated with the issue body.
- [ ] Every task has a populated detail document, or the ticket has no tasks because it is `xs` or `s`.
- [ ] Every task detail document includes acceptance criteria.
- [ ] `tndm ticket sync <ID>` was run after direct edits.

## When a skill says "fetch the relevant ticket"

Run `tndm ticket show <ID>`.
