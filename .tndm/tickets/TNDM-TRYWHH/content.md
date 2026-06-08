# Test Discovery: Import-Graph Analysis

## Objective
Replace the two-path test discovery pattern (naming conventions + stem matching) with a single, language-agnostic mechanism based on import-graph analysis.

## Current State
`findTestCompanionFiles()` in `src/analysis/relations/tests.ts` uses:
1. **Fast path**: Direct naming convention (`stem.test.ts`, `__tests__/stem.spec.ts`)
2. **Fallback**: Scan `__tests__/` directories, match by stem containment (fuzzy)

The fallback fails when test files have different names than their source files (e.g., `code-find-tool.test.ts` for `execute-find.ts`).

## Design

### Single Mechanism: Reference-Based Test Discovery
1. Use `provider.references()` to find all files importing the target source
2. Filter results using language-agnostic test file patterns
3. Return matches

### Test File Patterns
```
*.test.*    → foo.test.ts, foo.test.py
*.spec.*    → foo.spec.ts, foo.spec.rb
test_*      → test_foo.py
*_test.*    → foo_test.go
*_spec.*    → foo_spec.rb
```

### Implementation
```ts
export async function findTestCompanionFiles(
  targetAbs: string,
  provider: { references: ... }
): Promise<string[]> {
  const refs = await provider.references(targetAbs);
  return refs.filter(ref => isTestFile(ref.path));
}
```

### Trade-offs
| Aspect | Old (two-path) | New (import-graph) |
|--------|----------------|-------------------|
| Accuracy | Fails on naming mismatches | Ground truth |
| Complexity | Two mechanisms | One mechanism |
| Language support | JS/TS-specific (`__tests__/`) | Language-agnostic |
| Performance | O(1) for common names | Always queries provider |

## Verification
- Existing tests pass
- New test: naming-mismatch case discovers test via import analysis
