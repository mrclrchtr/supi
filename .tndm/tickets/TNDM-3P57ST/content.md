## Design

Remove re-injection feature from supi-claude-md. Each subdirectory's context is injected once (on first discovery) and never re-injected for the remainder of the session.

### Files changed

1. **`config.ts`** — Remove `rereadInterval` and `contextThreshold` fields from interface and defaults
2. **`state.ts`** — Remove `completedTurns`, simplify `InjectedDir` (drop `turn`), simplify `reconstructState`
3. **`claude-md.ts`** — Remove `turn_end` handler, remove turn from `formatSubdirContext` call, simplify `collectStaleDirs`
4. **`subdirectory.ts`** — Simplify `shouldInjectSubdir` to just check `injectedDirs.has(dir)`, remove `InjectionCheckOptions` fields, drop turn from `formatSubdirContext`
5. **`settings-registration.ts`** — Remove `rereadInterval` and `contextThreshold` setting items
6. **Tests** — Update all affected tests

### What stays

- Compaction resets injected-dir tracking (re-discovery after compact)
- First-time injection always happens regardless of context pressure
- Native-path dedup
- Discovery and formatting logic unchanged