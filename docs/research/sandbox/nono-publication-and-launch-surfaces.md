# Publish and launch a whole-process SuPi sandbox

_Status: 2026-07-29. macOS-only research. Primary sources only._

## Decision

**There is no currently releasable supported combination.** The direction to implement *after upstream release gates* is:

1. publish the ordinary SuPi features as their normal npm **Pi package(s)**; they provide product functionality, not sandbox enforcement;
2. publish a signed `mrclrchtr/supi-pi` **nono registry pack** that has an exact dependency on the signed `nolabs-ai/pi` pack and a SuPi-owned, pack-store profile derived from that base;
3. have a **nono-owned managed `pi` launch binding** install the only ordinary `pi` command. It records an absolute, verified real-Pi target and always executes `nono run --profile <pinned-profile> --allow-cwd --rollback -- <absolute-real-pi> <argv>`; and
4. retain the official pack's Pi extension only for status/denial explanation. It is neither the guard nor a fallback.

The last two pieces do not exist in a released form. The official `nolabs-ai/pi@0.1.0` pack tells the user to invoke `nono run … -- pi`; its manifest only wires a Pi package entry into `~/.pi/agent/settings.json`, and its extension merely observes `NONO_CAP_FILE`, adds guidance, and displays status. It does not refuse an unsandboxed process. [Official pack README](https://github.com/nolabs-ai/nono-packs/blob/0e0615eb14facb3101d5d858a802be973301d418/pi/README.md#L8-L28) · [manifest](https://github.com/nolabs-ai/nono-packs/blob/0e0615eb14facb3101d5d858a802be973301d418/pi/package.json#L10-L39) · [extension](https://github.com/nolabs-ai/nono-packs/blob/0e0615eb14facb3101d5d858a802be973301d418/pi/extensions/nono-sandbox.ts#L14-L28)

This is deliberately a conditional recommendation, **not** approval to ship a wrapper today. The latest released nono is `v0.69.0`; the later `v0.70.0` tag has a failed release workflow and no release asset. [v0.69.0 release](https://github.com/nolabs-ai/nono/releases/tag/v0.69.0) · [v0.70.0 tag](https://github.com/nolabs-ai/nono/commit/7bb07d1bc68d7f02994bb405e44954e9d0e3573f) · [failed release workflow](https://github.com/nolabs-ai/nono/actions/runs/30296965709)

## Why the boundary must precede Pi

Pi says that it has no built-in sandbox: built-ins, extensions, package installs, shell commands, language servers, and other developer tools run with the Pi process's permissions. It recommends running the **whole** Pi process in an OS/container/VM boundary when containment is required. A Pi package is installed and discovered by an already-started Pi process, so it cannot establish that process's kernel boundary. [Pi security model](https://github.com/earendil-works/pi/blob/b4f293684bba718d59cc1157679bcf6157b3a7f5/packages/coding-agent/docs/security.md#L31-L49) · [Pi package lifecycle](https://github.com/earendil-works/pi/blob/b4f293684bba718d59cc1157679bcf6157b3a7f5/packages/coding-agent/docs/packages.md#L18-L49)

On macOS, nono generates a Seatbelt profile and calls `sandbox_init()` before running the target; failure from that call is returned as a sandbox-initialization error. This is the placement that constrains Pi, every installed extension, and their child processes rather than only Pi's routed tools. [nono macOS application](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono/src/sandbox/macos.rs#L813-L858)

An extension can improve diagnostics, but it is too late and too optional to be enforcement: Pi supports `--no-extensions`, explicit extension selection, and reloadable/global/project resources. The official nono extension itself treats `NONO_CAP_FILE` as an indicator that the outer sandbox already exists. [Pi resource flags](https://github.com/earendil-works/pi/blob/b4f293684bba718d59cc1157679bcf6157b3a7f5/packages/coding-agent/docs/usage.md#L212-L233) · [extension locations](https://github.com/earendil-works/pi/blob/b4f293684bba718d59cc1157679bcf6157b3a7f5/packages/coding-agent/docs/extensions.md#L5-L16) · [official extension indicator](https://github.com/nolabs-ai/nono-packs/blob/0e0615eb14facb3101d5d858a802be973301d418/pi/extensions/nono-sandbox.ts#L46-L48)

## Concrete surface comparison

| Surface | Can contain the complete Pi tree before startup? | Can make normal `pi` fail closed? | Lifecycle verdict |
| --- | --- | --- | --- |
| SuPi npm/Pi package alone | No—Pi must first start and load it. | No. | Keep it for SuPi functionality only. |
| Official `nolabs-ai/pi@0.1.0` alone | Yes **only** when the user explicitly types `nono run … -- pi`. | No ordinary-command interposition. | Useful signed base profile and diagnostics, not a launch product. [README](https://github.com/nolabs-ai/nono-packs/blob/0e0615eb14facb3101d5d858a802be973301d418/pi/README.md#L8-L28) |
| Shell alias/function | Only when that particular shell expands it. | No: it is absent from direct executable paths, scripts, IDEs, and other shells. | No managed install, upgrade, restore, or explicit target identity. |
| Pack-supplied `~/.local/bin/pi` script/symlink using current wiring | Potentially, but only after a manual PATH convention and brittle target discovery. | Not reliably: the released wiring vocabulary can copy/symlink fixed paths but cannot resolve/preserve the pre-existing `pi`, assert command precedence, or provide a managed bypass/repair contract. | Do not make a security promise on this composition. [wiring vocabulary](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono-cli/src/wiring.rs#L1-L96) |
| **Future signed SuPi nono pack + nono managed launch binding** | **Yes.** The binding invokes `nono run` before the recorded real Pi program. | **Yes for ordinary command resolution:** missing/tampered binding, profile, nono binary, target, or rollback baseline is an error, never direct Pi. | **Selected, conditional on the gates below.** |

“Ordinary `pi`” is intentionally narrower than “a same-UID operator can never bypass it.” A user who can execute an absolute real-Pi path, alter `PATH`, or replace user-owned files can choose to run unsandboxed software. The product must not hide that fact; it must make the default command fail closed and expose a separate, named emergency escape hatch rather than a Pi flag or project setting.

## Exact proposed artifacts and ownership

| Owner | Published artifact | Responsibility |
| --- | --- | --- |
| Pi upstream | `@earendil-works/pi-coding-agent` and the existing SuPi npm Pi packages | Pi/SuPi functionality only. Install them **through the bound `pi`** after the binding is active; do not add a second sandbox guard extension. Pi packages are the supported npm/git distribution unit. [Pi packages](https://github.com/earendil-works/pi/blob/b4f293684bba718d59cc1157679bcf6157b3a7f5/packages/coding-agent/docs/packages.md#L18-L66) |
| nolabs-ai | `nolabs-ai/pi@<approved>` nono pack | Base Pi policy plus the existing non-enforcing diagnostic extension/skill. Its current profile grants `$HOME/.pi`, configures read/write CWD, disables capability elevation, and has rollback exclusions; SuPi must pin and review the exact pack version rather than rely on its current `min_nono_version: 0.55.0`. [manifest](https://github.com/nolabs-ai/nono-packs/blob/0e0615eb14facb3101d5d858a802be973301d418/pi/package.json#L1-L24) · [policy](https://github.com/nolabs-ai/nono-packs/blob/0e0615eb14facb3101d5d858a802be973301d418/pi/policy.json#L22-L105) |
| SuPi | `mrclrchtr/supi-pi@<version>` **nono pack** | A macOS-only derived `supi-pi` profile, exact base-pack/version dependency, reviewed policy deltas, and a declarative launch-binding request for command `pi`. Publish it from a dedicated tagged GitHub Actions workflow under the `mrclrchtr` namespace. nono pack pulls verify Sigstore provenance, namespace/signing identity, and retain a lockfile; this is the suitable distribution channel for the profile and binding. [pack publishing and OIDC rules](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/docs/cli/features/package-publishing.mdx#L1-L27) · [consumer verification](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/docs/cli/features/managing-packs.mdx#L9-L31) |
| nono upstream | Managed launch-binding feature and package-dependency lock | Own the privileged-by-convention mechanics once, not in TypeScript or shell glue in every agent pack. It must resolve the original executable before installation, record absolute path plus identity, set up PATH precedence, perform `nono run` with fixed outer arguments, provide doctor/refresh/bypass/remove operations, and reverse safely. It must also install and pin the declared `nolabs-ai/pi` dependency as part of the same verified transaction. |

The upstream work is necessary because release `0.69.0` has only six generic wiring directives (`symlink`, `write_file`, JSON/TOML/YAML edits). Although its `nono remove` safely replays recorded wiring in reverse, that mechanism has no command-resolution or original-executable semantics. A pack-specific shell shim would recreate an error-prone launcher implementation and make safe upgrades/uninstalls a SuPi maintenance burden. [closed directive set](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono-cli/src/wiring.rs#L35-L96) · [safe reversal implementation](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono-cli/src/package_cmd.rs#L129-L203)

### Required managed-binding contract

The proposed nono feature may be named differently upstream; these behaviors, not a name, are the requirement.

- A pack declares `command: "pi"`, a **pack-qualified/pinned** profile, and fixed nono options. The launcher record contains the canonical real-Pi executable and digest captured before the binding shadows `pi`.
- Invocation resolves the binding first, checks macOS/architecture, the approved nono release/digest, pack lock/provenance and artifact digests, profile, target identity, and rollback preflight. Any check failure exits before Pi starts.
- It constructs only `nono run --profile <pinned-pack-profile> --allow-cwd --rollback -- <absolute-target> <verbatim-user-argv>`. All user arguments occur after `--`; they cannot add `--no-rollback`, select another profile, or replace the target.
- `pi --version`, `pi install`, `pi update`, `pi remove`, print/JSON/RPC modes, and all other Pi arguments take the same path. The binding must not quietly invoke an unwrapped Pi for package management.
- The tool installs a separate unambiguous unsafe command (shown below) that uses the stored real target, prints a warning, and is never selected by a Pi argument, a project file, or the LLM. It is an operator opt-out, not evidence that the default is unbreakable.

## Lifecycle commands after the feature ships

These are the proposed user contract; placeholders intentionally prevent users from treating them as current commands.

```bash
# Bootstrap: verify/install nono itself from its approved macOS release first.
# Then one transaction pulls the exact signed SuPi pack and its exact nolabs-ai/pi dependency,
# installs the binding, verifies that `command -v pi` is the managed binding,
# and installs the requested SuPi npm Pi package through it.
nono pack install mrclrchtr/supi-pi@<approved> --bind pi
pi install npm:@mrclrchtr/<published-supi-package>@<approved>

# Normal use: always sandboxed, rollback baseline before Pi starts.
pi [Pi arguments ...]

# Review/restore only after the upstream rollback gate below is met.
nono rollback list --path "$PWD"
nono rollback show <session>
nono rollback restore <session> --snapshot 0 --dry-run
nono rollback restore <session> --snapshot 0

# Deliberate maintenance: inspect, stage, then atomically update the SuPi pack,
# official dependency, profile, binding, and stored Pi target identity. Update Pi/SuPi
# packages through the reinstalled binding; changing the Pi executable requires refresh.
nono pack update mrclrchtr/supi-pi --dry-run
nono pack update mrclrchtr/supi-pi
nono launch doctor pi
pi update --all
nono launch refresh pi

# Deliberate emergency bypass: direct stored target, conspicuous warning/audit entry;
# it is not an argument to `pi` and cannot be triggered from project config.
nono launch bypass pi --reason '<incident ticket>' -- [Pi arguments ...]

# Uninstall: remove SuPi Pi package, then reverse the binding and profile wiring
# from the pack lock, restoring the former command resolution only when it still matches.
pi remove npm:@mrclrchtr/<published-supi-package>
nono pack remove mrclrchtr/supi-pi
```

Today, nono exposes `pull`, `update`, `remove`, `pin`, and `outdated` for packs, and records wiring so removal can reverse it; those commands are the foundation for the proposed `pack install/update/remove` lifecycle, not proof that a launch binding exists. [CLI command definitions](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono-cli/src/cli.rs#L551-L829) · [pull/re-pull semantics](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono-cli/src/package_cmd.rs#L20-L105)

## Release gates

Do not publish the SuPi pack/binding or document the commands above as supported until **all** are true:

1. **Released nono binary, not a tag.** A macOS arm64 and x86_64 release contains the merged symlink-snapshot fix ([PR #1493](https://github.com/nolabs-ai/nono/pull/1493)) and passes malicious-symlink rollback tests on the exact downloaded archive. `v0.69.0` predates that merge. [v0.69.0 release](https://github.com/nolabs-ai/nono/releases/tag/v0.69.0) · [merge commit](https://github.com/nolabs-ai/nono/commit/d3227716c3ed735c72892ac9fdc8e528538284f5)
2. **Safe standalone restore.** The release persists the resolved per-root exclusion configuration (profile rules, CLI rules, force-includes, and gitignore behavior) in session metadata and uses it for dry-run and restore; legacy/ambiguous sessions must refuse restoration. In `v0.69.0`, capture enables gitignore and profile patterns, whereas standalone restore reconstructs only base exclusions with gitignore disabled. That is exactly the exclusion-loss condition observed for the Pi profile’s `.pi` exclusion. [capture path](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono-cli/src/rollback_runtime.rs#L61-L99) · [unsafe reconstruction](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono-cli/src/rollback_commands.rs#L618-L677) · [current metadata shape](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono/src/undo/types.rs#L434-L483)
3. **Released binding/dependency contract.** nono releases and documents the managed command binding plus exact transitive pack dependency locking, including target capture/refresh, PATH-precedence doctor, fail-closed launch, reversible uninstall, and separately audited bypass. It must be exercised across npm/curl/Pi update paths and both macOS architectures.
4. **Policy correctness and compatibility.** The exact released tuple—nono binary, `nolabs-ai/pi`, SuPi derived profile, Pi release, and SuPi package set—passes real syscall tests: forbidden host paths and authority sockets fail; project and allowed Pi state work; core tools, user `!` commands, provider login, TUI, web/review paths, and representative LSP/tsserver descendants work. Do not accept `nono why` alone as proof while [#1519](https://github.com/nolabs-ai/nono/issues/1519) remains unresolved.
5. **Rollback behavior.** The same tuple proves baseline capture fails before Pi on budget/error; restore preserves pre-existing excluded `$HOME/.pi`, project `.pi`, gitignored, and custom-glob files; and it restores included created/modified/deleted regular files. The current `--rollback` flag is opt-in and the official Pi profile excludes `.pi`, so neither the flag nor the pack currently provides this guarantee by itself. [rollback CLI flags](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono-cli/src/cli.rs#L1987-L2028) · [official profile exclusion](https://github.com/nolabs-ai/nono-packs/blob/0e0615eb14facb3101d5d858a802be973301d418/pi/policy.json#L95-L105)
6. **Supply-chain and removal drill.** A fresh macOS account can verify the nono release digest, pull the SuPi pack through its trusted GitHub Actions publisher identity, install SuPi, update it, update Pi and refresh the target, invoke/revoke the emergency bypass, and uninstall with the original command state restored. Test an edited/conflicting launch binding too: removal must stop and retain its lock record rather than silently orphan a command surface, matching nono’s existing wiring-removal safety model. [pack verification model](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/docs/cli/features/managing-packs.mdx#L9-L31) · [removal failure behavior](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono-cli/src/package_cmd.rs#L145-L184)

## Bottom line

Reuse the official `nolabs-ai/pi` pack as a pinned base, publish SuPi’s policy/integration as a separately signed nono pack, and put enforcement in a future nono-managed `pi` binding—not in a SuPi extension. Until upstream releases both safe rollback restoration and a managed, fail-closed launcher/dependency lifecycle, ship neither an “ordinary `pi` is sandboxed” claim nor a hand-rolled alias/shim as a supported SuPi integration.
