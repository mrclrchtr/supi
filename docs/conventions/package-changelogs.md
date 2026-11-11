# Extension Package changelogs

## Status

Implemented. Package notes are curated by hand (usually by an agent) during [release preparation](release-preparation.md) or earlier on `main`.

## Confirmed decisions

| Concern | Decision |
| --- | --- |
| Presentation | Use Pi's built-in Extension Updates only. No SuPi-specific dialog or changelog command. |
| Editorial ownership | Maintain distinct release notes for each Extension Package. Do not derive all package notes from the SuPi Release Notes. |
| Shared release notes | The root changelog and GitHub release body come from [release preparation](release-preparation.md). Package notes supplement that release-wide record. |
| Content boundary | Describe user-visible behavior delivered by the installed package, including relevant bundled capabilities. Do not copy internal dependency changes without user impact. |
| Introduction | Begin with a short introduction entry at the first release shipping package changelogs. Do not reconstruct older package histories. Accept Pi's silent first-seen baseline. |
| Retention | Retain package entries after introduction so users skipping releases can see intervening changes. |
| Unchanged packages | Do not add a section solely because the shared release version increased. Omit empty or “no changes” entries. |
| Source files | Check in a real `CHANGELOG.md` at each Extension Package root and use Pi's default path. No external symlinks, custom paths, or pack-time generation of release-note text. |
| Structural release gate | Missing or formally invalid changelogs and missing tarball entries block release. Content completeness remains an editorial review responsibility. |
| Editorial workflow | Update package changelogs by hand, either in earlier commits on `main` or in the Release Commit itself. `pnpm release:prepare` prints per-package commit drafts as editorial input only. |
| Release automation boundary | Preparation bumps versions and drafts the root changelog only. Do not write package notes automatically or add an `Unreleased` finalization step. |
| Forthcoming releases | Package changelogs on `main` may already contain the planned next release version while package manifests still carry the previous version. Correct headings manually if the planned release version changes. |

## Scope

- Keep one shared SuPi release version and Git tag.
- Require package changelogs for public Extension Packages: the current 17 packages with nonempty `pi.extensions` declarations.
- Derive eligibility from package declarations rather than maintaining another hardcoded package catalog.
- Do not add a changelog obligation for library-only Infrastructure Packages, private packages, or the standalone installer.
- Keep the root changelog as the source for the Workspace Extension Surface when loaded as one local or Git package.
- Do not change Pi settings, last-seen versions, rendering, or global `collapseChangelog` behavior.

## Manual editorial workflow

1. Before release, review user-relevant changes for each Extension Package, including visible effects of bundled capabilities.
2. Add concise English notes under the planned final shared release version in each affected package's `CHANGELOG.md`.
3. Commit those files to `main`, in an earlier commit or in the Release Commit. Package notes are ordinary repository content.
4. If the planned release version changes, correct the affected package headings manually before releasing.
5. Review the final release candidate for content completeness and version accuracy. Do not create entries for unchanged packages.

Use `## [X.Y.Z]` or `## X.Y.Z` headings without dates or suffixes, newest first, with nonempty notes. Pi compares numeric version cores only; a prerelease cannot publish an entry for its not-yet-released stable core. Use lower-level headings only when helpful. Explain required migration actions for breaking changes. Use absolute links to public documentation, issues, or commits rather than links relative to a packaged Markdown file.

The introduction entry establishes each package's history; subsequent entries must describe actual user-relevant changes. Preserve older entries rather than rewriting the history when preparing a new release.

## Validation boundaries

| Boundary | Required behavior |
| --- | --- |
| Source/development checks | Require readable, real package-local changelogs with at least one nonempty versioned entry, unique version headings, and descending version order. Allow forthcoming version headings ahead of the source manifest. |
| Tarball verification | Inspect the shipped artifact, not just its manifest allowlist. Require the eligible package's own `CHANGELOG.md` and validate its content. Development packing may contain forthcoming entries. |
| Actual release and publication | In addition to structural checks, reject any changelog entry newer than the package version being released. Enforce this before tag creation and npm publication, including the direct `publish.mjs --publish` path. |
| Unchanged packages | Accept a most-recent changelog entry older than the package version. Do not require a section for every shared release. |
| Editorial review | Check that the manually chosen versions and notes match the intended release. Structural checks cannot determine which changes deserve notes or detect every omitted user-facing change. |

Do not infer user relevance from touched file paths or synthesize placeholder notes.

## Implementation entry points

- [Shared validation](../../scripts/package-changelog.mjs) owns package eligibility, structural checks, and release-version bounds.
- [Staged packaging](../../scripts/pack-staged.mjs) validates source files before staging; package `files` lists explicitly include `CHANGELOG.md`.
- [Tarball verification](../../scripts/verify-tarball.mjs) validates actual shipped files, including bundled Extension Packages.
- [Release checkout validation](../../scripts/release-validation.mjs) rejects invalid or future notes before tag creation or registry access.
- Both [direct publication](../../scripts/publish.mjs) and [release publication](../../scripts/publish-released.mjs) enforce version bounds and verify their packed artifacts before npm publication.
- The existing packaging and release test suites cover these boundaries; Pi's own UI behavior is not duplicated in a new test framework.

## Acceptance criteria

- Every eligible Extension Package ships a readable package-root changelog with its retained history.
- Noneligible packages remain exempt.
- A normal development verification accepts a manually prepared forthcoming version heading.
- Release verification and actual publication reject headings newer than the released package version.
- Missing files, empty entries, duplicate versions, invalid version headings, and reversed version order fail the relevant checks.
- A package with no new notes can advance with the shared release version without generating a placeholder entry.
- A fresh interactive Pi launch can read notes from an independently installed package; no custom SuPi runtime code is needed.
- The first changelog-enabled installation establishes a silent baseline. A later package update can show notes, including retained entries from skipped releases.
- The existing root package/Git installation continues to use the common root changelog.
- Validation includes focused packaging/release tests and `pnpm verify:ai`; no npm publishing is performed during verification. Any Pi UI check uses temporary package copies and temporary settings rather than modifying the user's normal changelog state.

## Pi behavior and limitations

| Concern | Observed behavior |
| --- | --- |
| Eligibility | A package must load at least one extension. npm, Git, and local package directories are eligible. |
| Default file | `CHANGELOG.md` inside the package root; an external path or symlink target is not accepted. |
| Grouping | Extension files loaded through one package source share its changelog identity. Bundled extensions forwarded by the top-level manifest do not get separate notices. Independently loaded packages can each produce a notice. |
| First introduction | The first readable package changelog establishes a version baseline without displaying notes. |
| Invocation | Notices are collected at fresh interactive startup, not by resource reload alone. Resumed sessions with messages skip collection. |
| Retained history | Pi reads newer version headings from the installed file; it does not retrieve missing history. |
| Unchanged releases | No newer version heading means no update notice. |
| Development preview | Pi does not bound displayed entries by the current manifest version. A directly loaded local package may expose forthcoming notes already committed to `main`. Workspace-root installs continue to use the root changelog. |
| No catch-all viewer | `/changelog` shows Pi's changelog, not a package changelog. |

## Sources

- Installed Pi `docs/packages.md`, section **Show a changelog**.
- Installed Pi `dist/modes/interactive/interactive-mode.js`, extension changelog collection at startup.
- Installed Pi `dist/utils/changelog.js` and `dist/core/package-manager.js`.
- [Release preparation](release-preparation.md).
- [Release creation](../../scripts/create-release.mjs).
- [Staged packaging](../../scripts/pack-staged.mjs).
- [CI and release gates](ci-verification.md).
- [Project-wide terminology](../../GLOSSARY.md).
