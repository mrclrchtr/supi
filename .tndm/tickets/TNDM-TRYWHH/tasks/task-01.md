# Task 1: Add language-agnostic test file patterns

## Goal
Create a reusable `isTestFile()` function with language-agnostic patterns.

## File
`packages/supi-code-intelligence/src/analysis/relations/tests.ts`

## Change
Add a new exported function:

```ts
const TEST_FILE_PATTERNS = [
  /\.test\.[^.]+$/,    // foo.test.ts
  /\.spec\.[^.]+$/,    // foo.spec.py
  /^test_[^.]+$/,      // test_foo.py
  /_test\.[^.]+$/,     // foo_test.go
  /_spec\.[^.]+$/,     // foo_spec.rb
];

export function isTestFile(filePath: string): boolean {
  const filename = path.basename(filePath);
  return TEST_FILE_PATTERNS.some(p => p.test(filename));
}
```

## Verification
- Function is exported
- Matches: `foo.test.ts`, `foo.spec.py`, `test_foo.py`, `foo_test.go`, `foo_spec.rb`
- Does not match: `foo.ts`, `testing.ts`, `contest.ts`, `latest.ts`
