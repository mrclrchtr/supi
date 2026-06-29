# Task 5: Verify with targeted and full checks

**Description:**

Run targeted checks during development and the full repository verification before handing off. Include at least one live/manual tool check when running inside pi after reload, because this ticket changes public tool behavior and prompt-facing output.

Suggested live checks after reload:

- `code_resolve({ file, line, character })` on a symbol identifier returns a named target.
- `code_resolve({ file, line, character })` on a declaration/header coordinate snaps only when unambiguous and reports the snap.
- `code_context({ task, file, line, character, include: ["callees"] })` works in one call and returns a reusable targetId.
- `code_context({ targetId, file, line, character })` uses targetId and warns that coordinates were ignored.
- `code_context({ file, line, character })` on whitespace/comment fails with a `code_inspect` recommendation.

**Files:**

- Test files touched by the implementation.
- Any updated docs/tool metadata files.

**Acceptance criteria:**

- Targeted Vitest tests for `code_resolve`, `code_context`, and target metadata pass.
- Relevant package TypeScript builds pass.
- Biome passes for touched files.
- `pnpm verify:ai` passes.
- Live/manual checks confirm public markdown and structured behavior after extension reload, or the ticket notes why live checks could not be performed.
