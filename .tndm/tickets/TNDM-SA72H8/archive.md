# Archive

## Verification summary

Archived change: move `packages/supi-review/` instruction-block selection from host-side snapshot heuristics into brief synthesis, render only brief-selected mandatory review instructions, remove the old heuristic module, and keep docs/tests aligned.

### Ticket / plan state
- Ticket: `TNDM-SA72H8`
- All planned tasks are marked done in `state.toml` before closeout.
- Approved overview re-read from `.tndm/tickets/TNDM-SA72H8/content.md` before verification.

## Fresh verification evidence

### Task 1 — RED test contract exists in the final tree
Fresh evidence command:
```bash
rg -n "reviewInstructionBlockIds|Mandatory review instructions|mandatory review instructions|buildBriefSynthesisPrompt|Prefer omission over guessing|nonexistent" \
  packages/supi-review/__tests__/unit/brief-runner.test.ts \
  packages/supi-review/__tests__/unit/packet.test.ts \
  packages/supi-review/__tests__/unit/runner.test.ts \
  packages/supi-review/__tests__/unit/synthesize.test.ts \
  packages/supi-review/__tests__/unit/review-instruction-blocks.test.ts -S
```
Result: matched fresh assertions proving the intended tests exist:
- `brief-runner.test.ts` asserts `reviewInstructionBlockIds` is required and round-trips on success
- `packet.test.ts` asserts `## Mandatory review instructions` appears only when selected
- `runner.test.ts` asserts reviewer prompt uses `mandatory review instructions`
- `synthesize.test.ts` asserts prompt text includes the instruction-block catalog and `Prefer omission over guessing`
- `review-instruction-blocks.test.ts` includes the extra edge-case coverage added during review follow-up

### Task 2 — implementation is present and stale heuristic code is gone
Fresh evidence commands:
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-review/ -v
pnpm exec tsc -b packages/supi-review/tsconfig.json packages/supi-review/__tests__/tsconfig.json
```
Results:
- Vitest: `15` test files passed, `103` tests passed, exit code 0
- TypeScript: `TypeScript: No errors found`

Fresh stale-code removal check:
```bash
if [ ! -e packages/supi-review/src/target/audit-hints.ts ] && [ ! -e packages/supi-review/src/tool/child-resource-loader.ts ]; then echo 'removed files confirmed'; else exit 1; fi
if rg -n "deriveAuditHints|audit-hints|createDeterministicChildResourceLoader|DeterministicChildResourceLoaderOptions" packages/supi-review -S --glob '!**/*.tsbuildinfo' --glob '!**/README.md' --glob '!**/CLAUDE.md'; then exit 1; else echo 'no stale code references'; fi
```
Result:
- `removed files confirmed`
- `no stale code references`

This matches the approved design: no host-side heuristic selection path remains in code, and the fixed catalog + brief-selected IDs path is the one in use.

### Task 3 — docs verified against final code
Fresh docs wording check:
```bash
rg -n "audit hints|deterministic audit" packages/supi-review/README.md packages/supi-review/CLAUDE.md -S
rg -n "mandatory review instructions|instruction block|reviewInstructionBlockIds|review-instruction-blocks" packages/supi-review/README.md packages/supi-review/CLAUDE.md -S
```
Results:
- stale wording search returned no matches
- expected wording is present in both docs, including:
  - `reviewInstructionBlockIds`
  - `mandatory review instructions`
  - `review-instruction-blocks.ts`

Fresh staged diff review:
```bash
git diff --cached --stat -- packages/supi-review .tndm/tickets/TNDM-SA72H8
git diff --cached -- packages/supi-review/README.md packages/supi-review/CLAUDE.md | sed -n '1,220p'
```
Result:
- cached diff shows the real implementation delta (`28 files changed, 521 insertions, 238 deletions`)
- cached docs diff matches the final code behavior:
  - `audit hints` → `mandatory review instructions`
  - `audit-hints.ts` → `review-instruction-blocks.ts`
  - added `reviewInstructionBlockIds` in the documented brief schema
  - overview/inspector docs now reference shared packet derivation with mandatory review instructions

No further docs updates were needed during archive; the existing README/CLAUDE changes already matched the final code.

### Task 4 — full verification and interactive smoke-test evidence
Fresh automated commands:
```bash
RTK_DISABLED=1 pnpm vitest run packages/supi-review/ -v
pnpm exec biome check packages/supi-review
pnpm exec tsc -b packages/supi-review/tsconfig.json packages/supi-review/__tests__/tsconfig.json
```
Results:
- Vitest: `15` files / `103` tests passed, exit code 0
- Biome: `Checked 41 files ... No fixes applied.`, exit code 0
- TypeScript: `TypeScript: No errors found`

Fresh prompt-artifact check from the user’s interactive `/supi-review` smoke test export:
```bash
PROMPT=/var/folders/r6/hrsh_d017xsf08fd0rjqz9_m0000gn/T/supi-review-prompt-latest.txt
rg -n "^## Mandatory review instructions$|^## Audit hints$" "$PROMPT"
rg -n "Audit hints" "$PROMPT"
```
Results:
- `## Mandatory review instructions` present at line 73
- no `## Audit hints` section label present in the exported prompt
- one literal `Audit hints` string remains inside the session-derived brief open-question text (`line 33`), not as packet section wording

User decision on manual evidence:
- After reviewing the exported prompt, the user explicitly chose to **treat Task 4 as passed** because the packet/preview structure uses the correct section naming and no stale `## Audit hints` packet section remains.

## Final outcome
The implemented change matches the approved design:
- instruction-block selection moved into brief synthesis
- fixed host-owned catalog added at `packages/supi-review/src/target/review-instruction-blocks.ts`
- `SynthesizedReviewBrief` / `reviewBriefSchema` now carry `reviewInstructionBlockIds`
- packet building renders only brief-selected mandatory review instructions
- reviewer prompt terminology updated consistently
- old heuristic module removed
- docs and tests updated and verified
- follow-up review items addressed (`synthesize.test.ts` added, orphan loader removed, resolver edge-case tests added)

All planned tasks have fresh verification evidence and the ticket is ready to close.
