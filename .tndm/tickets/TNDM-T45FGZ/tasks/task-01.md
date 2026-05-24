# Task 1: Add .gitignore entries for generated files

Add patterns to `.gitignore` for TypeScript build artifacts:

```
# TypeScript project references — generated build artifacts
packages/*/dist/
packages/*/tsconfig.tsbuildinfo
packages/*/__tests__/tsconfig.tsbuildinfo
```

**Verification**: `grep -c tsbuildinfo .gitignore` returns 2, `grep -c dist/ .gitignore` returns at least 1.
