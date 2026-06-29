# Remove @mrclrchtr/supi meta-package

## Problem

The meta-package `@mrclrchtr/supi` serves only the `pi install npm:@mrclrchtr/supi` install path — it bundles 10 Production sub-packages into one aggregated extension and umbrella API re-export. The root `package.json` already lists every sub-package individually in `pi.extensions`, so the meta-package is redundant for workspace development. It adds ~90 lines of special-cased staging code, a Production/Beta tier distinction, and an assembly-from-tarballs step to the release flow.

## Approach

Delete `packages/supi/` entirely and remove all meta-package-specific handling from the publish pipeline, scripts, tests, and docs.

## Files to delete

- `packages/supi/` — extension.ts, api.ts, package.json, README.md, CLAUDE.md, tsconfig.json

## Files to edit

### `release-please-config.json`
Remove `"packages/supi/package.json"` from `extra-files`.

### `scripts/pack-staged.mjs`
Remove meta-package special casing: `stageMetaPackageSource`, `installMetaPackageBundles`, `resolveMetaWorkspaceDependencies`, `rewriteMetaRootManifest`, `collectBundledExternalRuntimeDependencies` functions, the `if (pkg.name === "@mrclrchtr/supi")` branch, and related imports (`cpSync`, `readdirSync` meta-package-only usage).

### `scripts/publish-released.mjs`
Remove the "Ensure meta-package is always published last" block (the `metaPath` constant and splice logic).

### `scripts/__tests__/pack-staged.test.mjs`
Remove 4 meta-package-specific tests:
- "produces npm-compatible root manifest for packages/supi (meta-package)"
- "produces npm-compatible bundled sub-package manifests for packages/supi"
- "publishes explicit api and extension subpaths for packages/supi"
- "exposes bundled packages' external runtime deps after installing packed packages/supi"

### `scripts/__tests__/bundled-extension-refs.test.mjs`
Remove the `@mrclrchtr/supi` exemption skip — it was the only package that didn't need bundled extension refs.

### `scripts/__tests__/package-import-smoke.test.mjs`
Remove `metaPackage` from the subpath resolution test cases.

### `docs/benchmarking-terminal-bench.md`
Remove `"packages": ["npm:@mrclrchtr/supi"]` reference.

## No changes to

- Root `package.json` — already lists all extensions individually
- Individual sub-packages — none depend on the meta package
- `pack:verify` — naturally skips the missing directory

## Verification

1. `pnpm typecheck` — all remaining packages type-check
2. `pnpm typecheck:tests` — all test files type-check
3. `pnpm test` — all tests pass
4. `pnpm pack:check` — all remaining packages pack without errors
5. `pnpm pack:verify` — tarball verification passes for bundled packages
6. `pnpm biome` — no lint/format issues
