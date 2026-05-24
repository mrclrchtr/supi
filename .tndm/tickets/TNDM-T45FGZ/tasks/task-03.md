# Task 3: Convert composite source tsconfigs (supi-core, supi-lsp, supi-tree-sitter)

Modify the 3 source tsconfigs for packages that ARE referenced by other supi packages. These need `composite: true` to emit `.d.ts` output consumed by downstream projects.

### supi-core (`packages/supi-core/tsconfig.json`)
No supi deps, but 12 downstream dependents. No references needed.
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "composite": true,
    "emitDeclarationOnly": true,
    "declarationDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["__tests__"]
}
```

### supi-lsp (`packages/supi-lsp/tsconfig.json`)
Depends on supi-core, referenced by supi-code-intelligence.
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "composite": true,
    "emitDeclarationOnly": true,
    "declarationDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["__tests__"],
  "references": [{ "path": "../supi-core" }]
}
```

### supi-tree-sitter (`packages/supi-tree-sitter/tsconfig.json`)
Depends on supi-core, referenced by supi-code-intelligence.
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "composite": true,
    "emitDeclarationOnly": true,
    "declarationDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["__tests__"],
  "references": [{ "path": "../supi-core" }]
}
```

### Why `noEmit: false` is required
The base tsconfig sets `noEmit: true`. Composite requires emit (for `.d.ts`). Tested — composite does NOT override inherited `noEmit`; explicit `noEmit: false` is required.

**Verification**: `pnpm exec tsc -b packages/supi-core/tsconfig.json --verbose --force` emits `dist/api.d.ts` without errors.
