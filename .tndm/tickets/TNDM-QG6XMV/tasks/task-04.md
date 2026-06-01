# Task 4: Converge CodeGraphParameters schema with active CodeGraphExtendedParameters

The `CodeGraphParameters` in `src/workflow/schemas.ts` only has `targetId`, `relations`, `direction`, `depth`, `maxNodes`. The active registered schema `CodeGraphExtendedParameters` in `src/tool/tool-specs.ts` adds `file`, `line`, `character`, `symbol`, `path`, `maxResults`.

Update `CodeGraphParameters` to match the active surface. These extra params let `code_graph` accept raw coordinates when no targetId is available.

Also verify that `CodeGraphExtendedParameters` and `CodeGraphParameters` converge to a single source of truth. If they can't merge fully (different usage contexts), at least add a comment explaining the divergence.
