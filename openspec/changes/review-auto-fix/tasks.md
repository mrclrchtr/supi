## 1. Rich content formatting

- [ ] 1.1 Add `formatReviewContent(result: ReviewResult): string` function in `index.ts` that converts a `ReviewResult` into a markdown string with numbered findings, file paths, line ranges, priority labels, titles, bodies, and overall verdict/explanation. For non-success results, return the existing terse summary.
- [ ] 1.2 Update `injectReviewMessage()` to call `formatReviewContent()` for the `content` field instead of the current terse string.
- [ ] 1.3 Add unit tests for `formatReviewContent()` covering: success with findings, success with no findings, failed, canceled, and timeout results.

## 2. Auto-fix setting

- [ ] 2.1 Add `autoFix: boolean` to `ReviewSettings` in `types.ts` with default `false` in `REVIEW_DEFAULTS` in `settings.ts`.
- [ ] 2.2 Register `autoFix` setting item in `buildReviewSettingItems()` as "Auto-Fix After Review" with cycle values `on`/`off`.
- [ ] 2.3 Add `persistChange` handling for `autoFix` in `registerReviewSettings()` — persist `true`/`false`, unset on default.

## 3. Interactive auto-fix selector

- [ ] 3.1 Add `selectAutoFix(ctx, defaultValue: boolean)` function in `ui.ts` that presents a two-option selector ("Yes — fix all findings" / "No — review only") pre-selected from the passed default value. Returns `boolean | undefined` (undefined on cancel).
- [ ] 3.2 Wire `selectAutoFix` into `handleInteractive()` in `index.ts` as a third step after `selectDepth`, passing the persisted `autoFix` setting as default. Cancel aborts the review.

## 4. Non-interactive auto-fix flag

- [ ] 4.1 Extend `parseNonInteractiveArgs()` in `args.ts` to extract `--auto-fix` and `--no-auto-fix` flags. Add an `autoFix: boolean | undefined` field to `ParsedArgs` (undefined means "use setting").
- [ ] 4.2 Update the `USAGE` string to include the new flags in the grammar.
- [ ] 4.3 Add unit tests for `--auto-fix`, `--no-auto-fix`, and neither flag present.

## 5. Auto-fix follow-up message

- [ ] 5.1 Update `injectReviewMessage()` signature to accept `autoFix: boolean` and `pi: ExtensionAPI`. After calling `pi.sendMessage()`, if `autoFix` is true and `result.kind === "success"` and `result.output.findings.length > 0`, call `pi.sendUserMessage("Fix all findings from the review above.")`.
- [ ] 5.2 Thread the resolved `autoFix` value through `handleInteractive()` and `handleNonInteractive()` to `injectReviewMessage()`. For non-interactive, resolve `autoFix` as: parsed flag ?? persisted setting.
- [ ] 5.3 Add integration tests verifying `sendUserMessage` is called when auto-fix is enabled with findings, and NOT called when disabled, when there are no findings, or when the result is non-success.

## 6. Verification

- [ ] 6.1 Run `pnpm exec biome check packages/supi-review/` and fix any issues.
- [ ] 6.2 Run `pnpm exec tsc --noEmit -p packages/supi-review/tsconfig.json` and fix type errors.
- [ ] 6.3 Run `pnpm vitest run packages/supi-review/` and ensure all tests pass.
