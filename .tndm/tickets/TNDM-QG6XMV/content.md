## Overview

Merge `code_brief` into `code_context` by removing `code_brief` from the public tool surface. `code_context` already handles orientation when `task` is omitted.

Also fix: hover truncation in `code_context`, and converge `CodeGraphParameters` workflow schema with the active `CodeGraphExtendedParameters`.

## Tasks

1. Remove `code_brief` from public tool registration (specs, type lists)
2. Update all follow-up tool suggestions to replace `code_brief` with `code_context`
3. Fix hover truncation in `code_context`'s `buildDefinitionLines`
4. Converge `CodeGraphParameters` schema with active `CodeGraphExtendedParameters`
5. Update tests for removed `code_brief` registration
6. Update CLAUDE.md and README.md
7. Run full verify (typecheck + tests + lint)
