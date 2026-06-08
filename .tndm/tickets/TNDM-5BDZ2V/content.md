## Plan: Remove Repeated Guidance/Footer Text

### Goal
Delete ~200–215 tokens of boilerplate guidance from tool outputs that the agent already knows from the system prompt. Gate git context in orientation briefs behind a once-per-session flag.

### File map
| File | Change |
|---|---|
| `src/presentation/markdown/resolve.ts` | Delete "Next steps" and anchored one-liner guidance blocks |
| `src/presentation/markdown/relations.ts` | Delete substrate footer notes from callees, imports, exports, implementations |
| `src/presentation/markdown/pattern.ts` | Delete "Text search" footer from `renderPatternResults` and `renderPatternSummary` |
| `src/app/workspace-session.ts` | Add `hasShownGitContext: boolean` field |
| `src/tool/execute-context.ts` | Access workspace session, pass `showGitContext` flag, set it after first render |
| `src/use-case/generate-context.ts` | Thread `showGitContext` through `executeOrientationContext` to brief renderer |
| `src/brief-focused.ts` | Check `showGitContext` flag before emitting git context (3 call sites) |
| `__tests__/unit/code-resolve-tool.test.ts` | Update assertions that expect guidance text in output |
| `__tests__/unit/brief.test.ts` | Update git context test to account for once-per-session behavior |

### Constraints
- `code_health` dirty section is untouched (dedicated requested feature)
- First-turn overview git context in `build-overview.ts` is untouched (separate mechanism)
- The `_Note: kind is ignored in text/regex mode_` advisory in `execute-find.ts` stays (different concern — parameter-specific, not boilerplate)