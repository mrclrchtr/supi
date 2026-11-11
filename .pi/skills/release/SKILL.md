---
name: release
description: "Prepare, curate, and ship a SuPi release from main."
disable-model-invocation: true
compatibility: Requires Git, pnpm, and an authenticated gh CLI.
---

# Release

A **Release Commit** is `chore: release X.Y.Z` on `main`. Pushing it is the release: CI verifies it, tags it, creates the GitHub release from the first `CHANGELOG.md` section, and publishes to npm. Rules and recovery live in `docs/conventions/release-preparation.md`; read it when a step fails.

You are the editor. git-cliff writes a commit list; you turn it into notes a SuPi user wants to read.

## 1. Prepare

1. `git switch main && git pull --ff-only`. Stop and report if the tree is dirty.
2. Run `pnpm release:prepare`, adding `--version X.Y.Z` only when the user named a version. Keep its stdout: the root draft, per-package drafts, and commit range are your editorial input.
3. On error, report it verbatim and stop.

Done when `package.json` carries the new version and `CHANGELOG.md` starts with its section.

## 2. Curate the root notes

Rewrite the body of the first `CHANGELOG.md` section. Keep its `## [X.Y.Z](compare-link) (date)` heading line exactly. When the output says **Re-prepared**, keep curated notes and work in the newly listed commits; a section that is still a raw draft (bullets ending in commit-hash links) gets curated in full from `git log vPREVIOUS..HEAD`.

- Open with one sentence naming the release's themes.
- Group bullets under `###` headings by user-facing area (for example *Code Intelligence & LSP*, *Agents & Review*, *Web*), largest area first.
- Each bullet states the user-visible effect, not the implementation. Merge commits that deliver one change into one bullet.
- Put `### ⚠ BREAKING CHANGES` first when present, each with the required migration step.
- Keep issue links (`[#576](https://github.com/mrclrchtr/supi/issues/576)`); drop commit hashes.
- Collapse routine dependency updates into one bullet; name Pi upgrades explicitly.
- Read a commit with `git show --stat <sha>` whenever its subject leaves the user impact unclear.

Done when every commit in the draft is covered by a bullet or deliberately dropped as internal.

## 3. Curate package changelogs

Follow `docs/conventions/package-changelogs.md`.

1. For each package in **Package drafts**, make sure its `## [X.Y.Z]` entry in `packages/<pkg>/CHANGELOG.md` covers every user-visible change, adding bullets where missing. Include visible effects of bundled packages (check `bundledDependencies`). Dependency bumps without visible behavior change stay out.
2. Find unreleased headings: any package heading whose `vVERSION` tag does not exist (`git tag -l v<version>`) and is below X.Y.Z belongs to this release. Rename it to `## [X.Y.Z]`, merging with an existing X.Y.Z entry.
3. Skip unchanged packages entirely.

Done when every package draft is either reflected in its changelog or judged internal, and no package changelog has an untagged heading other than X.Y.Z.

## 4. Review with the user

Show the user:

- the version and commit range;
- the curated root section in full;
- one line per touched package changelog, summarizing what its X.Y.Z entry says;
- `git diff --stat`.

Ask for approval. Apply requested edits and show the result again. Pushing publishes to npm, so wait for an explicit yes.

## 5. Commit, validate, push

1. `git add -A && git commit -m "chore: release X.Y.Z"` with hooks enabled. A re-prepare can leave nothing to commit; then add `--allow-empty`, because CI releases only from a new Release Commit at the tip of main.
2. Run the CI release gate locally:
   `RELEASE_SHA=$(git rev-parse HEAD) RELEASE_VERSION=X.Y.Z node scripts/release-validation.mjs`.
   On failure, fix it with `git commit --amend --no-edit` and rerun.
3. `git push origin main`. If main only accepts PRs, open one and rebase-merge it, or squash it with the title exactly `chore: release X.Y.Z`; a `(#N)` suffix fails CI planning.

## 6. Watch CI

1. Find the run: `gh run list --workflow ci.yml --commit $(git rev-parse HEAD) --limit 1`.
2. `gh run watch <id> --exit-status`.
3. Success: report the release URL (`gh release view vX.Y.Z --json url`).
4. Failure: inspect `gh run view <id> --log-failed`, classify it as code or transient, and propose the matching recovery from the recovery table in `docs/conventions/release-preparation.md`. A code fix is a new ordinary commit followed by this skill again; the same version is re-prepared.
