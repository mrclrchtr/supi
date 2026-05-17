## Approved Design

### Goal
Preserve every SuPi sub-package as a standalone install target while making the published install surfaces explicit, stable, and independent of workspace-only `src/...` deep imports or pnpm hoisting behavior.

### Core decisions

1. **Keep standalone packages** for every published `@mrclrchtr/supi-*` package.
2. **Keep the meta-package** `@mrclrchtr/supi` for now.
3. **Apply one uniform public-surface design to every published package**.
4. **Do not expose `.` as a public import surface** for published packages.
5. **Do not rely on deep `src/...` imports across package boundaries**.

### Standard package surface for every published package
Each published package will expose explicit subpaths via `package.json` `exports`:

- `./extension` → the extension entrypoint used by pi/meta-package
- `./api` → the package's public programmatic API surface
- `./package.json` → package metadata for tooling/tests

`pi.extensions` remains a file path to the extension entry module inside the package.

### Standard source layout
Move toward a consistent internal layout for every published package:

- `src/extension.ts` — the extension entrypoint
- `src/api.ts` — public programmatic surface

Packages that currently have only an extension surface should still define both surfaces for consistency. In those packages, `src/api.ts` may be a thin re-export of `src/extension.ts` (or expose any stable helpers/types if needed). The important rule is that consumers use explicit subpaths, never root imports.

### Import rules after the change
- Meta-package wrappers import only `@mrclrchtr/supi-*/extension`
- Cross-package library consumers import only `@mrclrchtr/supi-*/api`
- No package imports another package's `src/...` files
- No published consumer path relies on `.`

### Meta-package assembly strategy
The meta-package should stop being assembled from a raw workspace copy as the source of truth.

Instead:
1. Pack each Production sub-package as its own standalone tarball first
2. Create a clean meta-package staging directory
3. Install those local tarballs into the staged meta-package
4. Pack the staged meta-package from those already-valid standalone artifacts

This makes standalone tarballs the canonical artifact and prevents the meta-package from depending on pnpm hoisting layout or workspace-only package internals.

### Testing / verification requirements
Add or expand packaging verification so CI proves the published surfaces work:

1. **Tarball structure checks**
   - each published package contains the declared `./api` and `./extension` targets
2. **Import smoke tests**
   - `import("@mrclrchtr/supi-foo/api")` works
   - `import("@mrclrchtr/supi-foo/extension")` works
3. **Negative boundary checks**
   - deep imports like `@mrclrchtr/supi-lsp/src/lsp.ts` fail once `exports` is in place
4. **Meta-package smoke test**
   - install the built `@mrclrchtr/supi` tarball in a temp directory and load every declared extension entrypoint

### Scope
Apply this streamlined design to **every published package**, not just the dual-surface packages, so the repo has one consistent architecture.

### Non-goals
- Preserve backward compatibility for root (`.`) imports
- Preserve deep-import compatibility
- Drop the meta-package immediately unless this design proves too costly

### Expected impact
This is a deliberate breaking API/package-surface change for consumers importing package roots today. Internal repo imports, docs, tests, and packaging scripts will need coordinated updates.

### Next step
Create a concrete implementation plan covering:
- package-by-package file/layout changes
- `exports` additions
- cross-package import updates
- meta-package wrapper updates
- pack/publish pipeline changes
- packaging smoke tests and CI coverage
