# Task 3: Update supi-review docs and run full package verification

## Goal
Bring maintainer and package docs in line with the new brief-input architecture and finish with full verification.

## Required changes
- In `packages/supi-review/README.md`, replace the evidence-scoring description with the compaction-style serialized-session-context flow.
- In `packages/supi-review/CLAUDE.md`, update the architecture and gotchas sections so they describe session-context serialization instead of scored evidence extraction.
- Do not add new behavior in this task; it is documentation plus final verification only.

## Test-exempt rationale
This task updates documentation and performs package-level verification rather than introducing new logic.

## Manual/command verification
Run the full verification command above and expect all supi-review tests, both typechecks, and Biome to pass.
