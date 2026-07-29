# Explain destructive rollback of excluded Pi state

_Status: 2026-07-29. Research for [Explain destructive rollback of excluded Pi state](https://github.com/mrclrchtr/supi/issues/251) under [Wayfind a published sandbox for SuPi](https://github.com/mrclrchtr/supi/issues/244)._

## Answer

**`nono rollback restore <session> --snapshot 0` in released nono 0.69.0 rebuilds a different exclusion filter from the one used to create the snapshot.** The Pi pack's `.pi` exclusion is applied at capture, so existing global and project `.pi` files are absent from snapshot 0. The later standalone restore ignores that exclusion, sees those live files, and deletes every one absent from the manifest.

There is **no released nono version, profile setting, or standalone restore command that fixes this general case** as of this research. `v0.70.0` is only a tag: its GitHub Release workflow failed, GitHub has no release asset, and Homebrew still distributes 0.69.0. More importantly, its source leaves the faulty restore reconstruction unchanged. The published SuPi integration must remain blocked until an upstream released version persists the resolved snapshot filter and restores with it, followed by the required behavioral tests.

## Root cause

At launch, nono combines its base exclusions with the profile's rollback exclusions, enables `.gitignore`, and constructs per-root filters for the snapshot manager:

- [`rollback_runtime.rs` in v0.69.0](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono-cli/src/rollback_runtime.rs#L61-L99) builds that filter.
- The signed [`nolabs-ai/pi@0.1.0` policy](https://github.com/nolabs-ai/nono-packs/blob/0e0615eb14facb3101d5d858a802be973301d418/pi/policy.json#L57-L66) adds `.pi` to `undo.exclude_patterns` (the field is an accepted alias for `rollback`).
- Profile filesystem grants count as user intent, so `$HOME/.pi` is a rollback root as well as the writable working directory ([`CapabilitySource::is_user_intent`](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono/src/capability.rs#L64-L70)).

For a later `nono rollback restore`, the CLI does **not** load the stored profile or stored filter. It constructs a fresh filter with only built-in exclusions, disabled `.gitignore`, no profile patterns, no globs, and no force-includes ([`rollback_commands.rs` in v0.69.0](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono-cli/src/rollback_commands.rs#L618-L677)). `.pi` is absent from the built-in list ([`rollback_base_exclusions`](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono-cli/src/launch_runtime.rs#L16-L30)). `SnapshotManager::restore_to()` then deletes every current file not in the manifest ([`snapshot.rs`](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono/src/undo/snapshot.rs#L248-L334)).

`SessionMetadata` records tracked roots but no exclusion configuration, so the restore command cannot recover the original semantics ([`types.rs`](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono/src/undo/types.rs#L434-L483)).

## Reproduction

On macOS arm64 with Homebrew nono 0.69.0, I used a disposable HOME and workspace with:

```json
{
  "filesystem": { "allow": ["$HOME/.pi"] },
  "workdir": { "access": "readwrite" },
  "undo": { "exclude_patterns": [".pi"] }
}
```

A rollback run modified an existing project `.pi/settings.json` and `$HOME/.pi/agent/settings.json`. Snapshot 0 tracked both roots but contained zero files. `nono rollback restore <session> --snapshot 0 --dry-run` listed both files for deletion; the real restore removed both. The profile grant alone was sufficient—no additional CLI grant for `$HOME/.pi` was needed.

This is the same mechanism as the Pi-pack reproduction, without touching real Pi state.

## Version and workaround assessment

- The merged symlink work in [#1493](https://github.com/nolabs-ai/nono/pull/1493) is included in the `v0.70.0` tag, but it addresses symlink walking. Its [standalone restore code](https://github.com/nolabs-ai/nono/blob/7bb07d1bc68d7f02994bb405e44954e9d0e3573f/crates/nono-cli/src/rollback_commands.rs#L618-L677) still hard-codes the incomplete filter. Its [Release workflow failed](https://github.com/nolabs-ai/nono/actions/runs/30296965709), so it is not a published install target anyway.
- Removing every exclusion or passing `--rollback-include .pi` prevents this particular deletion by putting `.pi` in the manifest, but is not a valid SuPi profile. `--rollback-include` matches a component across every tracked root, so it cannot include only the project `.pi`; it also captures and restores global Pi authentication/settings and leaves the broader custom-exclusion mismatch unresolved ([matching semantics](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono/src/undo/exclusion.rs#L111-L172)).
- The in-process post-exit review receives the original `SnapshotManager`, so it does not perform this particular filter reconstruction. It is still optional and interactive, not a safe substitute for the required explicit recovery command ([runtime call site](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono-cli/src/rollback_runtime.rs#L571-L579), [review UI](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono-cli/src/rollback_ui.rs#L16-L58)).

## Required released upstream boundary

Accept a nono release only after it:

1. persists the fully resolved, per-root snapshot filtering semantics (profile exclusions, CLI exclusions/globs/includes, and gitignore behavior) with the session, or records the exact eligible path set;
2. makes standalone restore and dry-run use those persisted semantics, refusing legacy/ambiguous sessions rather than deleting omitted files;
3. behaviorally proves that restoring snapshot 0 preserves pre-existing excluded global `.pi`, project `.pi`, gitignored paths, and custom-glob matches while still restoring created, modified, and deleted included project files; and
4. also passes the map's malicious-symlink rollback regression on the exact released binary.

Until then, the only safe specification is: capture may be demonstrated, but **do not expose `nono rollback restore` as a recovery path for a profile with exclusions**. That fails the map's required rollback guarantee, so the integration remains a release blocker.

## Sources

- [nono v0.69.0 release](https://github.com/nolabs-ai/nono/releases/tag/v0.69.0)
- [nono v0.70.0 tag commit](https://github.com/nolabs-ai/nono/commit/7bb07d1bc68d7f02994bb405e44954e9d0e3573f)
- [nono v0.70.0 failed Release workflow](https://github.com/nolabs-ai/nono/actions/runs/30296965709)
- [nono Pi pack `pi-v0.1.0`](https://github.com/nolabs-ai/nono-packs/tree/0e0615eb14facb3101d5d858a802be973301d418/pi)
