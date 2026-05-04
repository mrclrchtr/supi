## Context

`packages/supi-ask-user/src/flow.ts` — the `QuestionnaireFlow` class has 7 methods that each begin with a terminal-mode guard:

- `advance()` line ~78: `if (this.mode !== "answering") return false;`
- `goBack()` line ~90: `if (this.mode === "terminal") return false;`
- `enterReview()` line ~99: `if (this.mode === "terminal") return false;`
- `submit()` line ~108: `if (this.mode === "terminal") return false;`
- `skip()` line ~115: `if (this.mode === "terminal") return false;`
- `cancel()` line ~121: `if (this.mode === "terminal") return;`
- `abort()` line ~127: `if (this.mode === "terminal") return;`

The guard check is identical in 5 methods and slightly differs (void return) in 2. While each guard is only 1-2 lines, the repetition across 7 methods is a maintenance hazard — if the terminal condition ever changes (e.g. additional states), 7 sites need updating.

## What to do

Add a private helper:

```ts
private guardNotTerminal(): boolean {
  return this.mode !== "terminal";
}
```

Then replace the guards:

```ts
advance(): boolean {
  if (this.mode !== "answering") return false; // unique guard — leave as-is
  ...
}
goBack(): boolean {
  if (!this.guardNotTerminal()) return false;
  ...
}
```

For `cancel()` and `abort()` (void return), use `if (!this.guardNotTerminal()) return;`.

## Pre-validation

Read `packages/supi-ask-user/src/flow.ts` fully. Verify:
- Exactly which methods use the `this.mode === "terminal"` guard
- `advance()` has a different guard (`this.mode !== "answering"`) — do not touch it
- The helper can be private and only used inside the class
- After refactor, `pnpm vitest run packages/supi-ask-user/` passes

## Files affected
- `packages/supi-ask-user/src/flow.ts`
