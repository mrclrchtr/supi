# Overview

Start refactoring the shared text/report rendering layer by introducing a small reusable report helper module in `@mrclrchtr/supi-core`, then slim `@mrclrchtr/supi-context` without changing the `/supi-context` user-facing output.

## Scope

- add reusable text/report primitives to `packages/supi-core`
- export and document the new shared helper surface
- split `packages/supi-context/src/format.ts` into smaller focused modules while keeping package structure mostly flat
- migrate `supi-context` to use the shared helpers
- preserve existing output semantics and test coverage

## Constraints

- keep the solution small and reusable; do not build a large report framework
- avoid changing `/supi-context` message content except for harmless formatting-equivalent refactors
- keep `supi-context` mostly flat unless a new folder is clearly justified
- add tests for any new exported `supi-core` API

## Expected result

A new shared report helper surface exists in `supi-core`, `supi-context`'s formatting code is split into smaller files, the large formatter no longer needs to own all rendering logic, and existing tests still pass.