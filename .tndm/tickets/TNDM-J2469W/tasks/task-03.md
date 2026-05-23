# Task 3: Add skip-list annotations to file overview table

Add a `classifySkipCategory(file: string): string | undefined` helper that matches filenames against known skip patterns:

- Lockfiles: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Gemfile.lock`, `Cargo.lock`, `poetry.lock`, `composer.lock`
- Generated dirs: paths containing `dist/`, `build/`, `.next/`, `__generated__/`
- Snapshots: paths containing `__snapshots__/`, `*.snap` extension
- Vendored: paths containing `vendor/`, `third_party/`
- Changelogs: `CHANGELOG*`, `CHANGES*`
- Minified: `*.min.js`, `*.min.css`

In the file overview table, annotate matching files with the category: `(skip — lockfile)`, `(skip — generated)`, etc.

The skip-list is a filename-only heuristic. Do not inspect file contents.

**TDD:** Write a unit test for `classifySkipCategory` with positive and negative cases. Test that the packet table includes skip annotations for matching files.

