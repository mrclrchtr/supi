# Validate nono's security and Pi integration boundary

_Status: 2026-07-28. Research for [#245](https://github.com/mrclrchtr/supi/issues/245) under the fixed choices in [map #244](https://github.com/mrclrchtr/supi/issues/244)._

## Decision

**Select nono as the macOS enforcement base, but do not ship the official Pi pack as-is and do not ship against the currently released nono 0.69.0.** The publishable design should reuse the signed `nolabs-ai/pi` pack, add a small SuPi-owned policy/launch layer, and avoid implementing another sandbox. Its ordinary `pi` entry point must be an outer, fail-closed launcher that applies a pinned nono profile **before Pi starts**, forces rollback capture, and then executes the real Pi binary by an absolute path.

This is a **conditional architectural go**, not a finding that the stack is release-ready today:

- nono is the only candidate whose current macOS primitive naturally covers Pi itself, arbitrary extensions, SuPi's in-process tools, and every descendant such as a language server while preserving the native macOS runtime;
- the official pack supplies useful Pi wiring and a compatibility-oriented starting profile, but its extension is diagnostics only, its documented command is opt-in, its environment is default-inherit, and rollback is not enabled;
- nono 0.69.0 predates the merged rollback symlink fix, and a current open report shows a deny/allow mismatch on 0.69.0; a release containing the relevant fixes plus behavioral verification is a release gate;
- unrestricted IP egress must not silently imply access to host-control Unix sockets. The final policy must default-deny or concretely deny and test those sockets, or the specification must explicitly admit that the boundary can be bypassed through a reachable Docker/Podman-equivalent daemon.

Gondolin has the stronger primitive against a host-kernel escape, but that extra boundary addresses an excluded threat while its current Pi adapter leaves SuPi execution on the host and its checkpoints do not cover the host workspace mount. Anthropic sandbox-runtime can wrap a whole process, but its current Pi example does not, it has no rollback, and its validated configuration cannot currently express unrestricted networking while retaining filesystem confinement.

### Meaning of “automatic rollback”

This decision interprets the map's phrase as: **every ordinary launch automatically creates a pre-session baseline and post-session diff, with a reliable restore path**. It does not mean unconditional reversion when Pi exits. nono prompts `Restore to initial state? [y/N]` and keeps changes by default. If the requirement instead means automatic or complete reversal of every filesystem mutation, no evaluated candidate meets it, and nono's current rollback must not be described that way.

## Fixed evaluation boundary

The relevant attacker is malicious model output, project content, extension code, tool code, or a spawned process running as the current user. The host kernel is trusted. The project must be read/write. The map deliberately accepts unrestricted outbound Internet access and read/write access to all of `~/.pi`, including OAuth state, packages, and settings.

Consequences that should remain explicit in the final specification:

1. Anything readable in the project or `~/.pi` is exfiltratable because egress is open.
2. Malicious code can persist in mutable `~/.pi` packages/settings for later sessions. The outer launcher must therefore remain outside `~/.pi` and apply the sandbox again on every launch.
3. “Unrestricted outbound” should be defined as IP egress, host-local TCP, and AF_UNIX separately. A host-control socket is an authority boundary, not merely another destination.
4. This is a same-kernel capability sandbox, not a multi-tenant or hostile-kernel boundary.

## Why the boundary has to be outside Pi

Pi intentionally does not sandbox extensions: its security documentation says extensions run with the user's permissions and can execute arbitrary code. The official Gondolin and sandbox-runtime examples replace selected built-in operations rather than constraining the Pi process ([Pi security](https://github.com/earendil-works/pi/blob/b4f293684bba718d59cc1157679bcf6157b3a7f5/packages/coding-agent/docs/security.md), [extensions](https://github.com/earendil-works/pi/blob/b4f293684bba718d59cc1157679bcf6157b3a7f5/packages/coding-agent/docs/extensions.md)).

That distinction is material in the current SuPi tree:

- `supi-code-intelligence` starts its LSP controller during trusted `session_start` ([lifecycle](https://github.com/mrclrchtr/supi/blob/0044d91688737d084252cb6daeff924b33dbc179/packages/supi-code-intelligence/src/substrate/lsp/lifecycle.ts));
- `supi-lsp` resolves commands from the Pi process's `PATH` and directly calls Node's `spawn()` with inherited environment and stdio ([resolution](https://github.com/mrclrchtr/supi/blob/0044d91688737d084252cb6daeff924b33dbc179/packages/supi-lsp/src/utils.ts), [spawn](https://github.com/mrclrchtr/supi/blob/0044d91688737d084252cb6daeff924b33dbc179/packages/supi-lsp/src/client/client.ts));
- the TypeScript default is `typescript-language-server --stdio` ([defaults](https://github.com/mrclrchtr/supi/blob/0044d91688737d084252cb6daeff924b33dbc179/packages/supi-lsp/src/config/defaults.json));
- other SuPi features perform host-side fetches, git commands, extension logic, and programmatic child sessions ([web](https://github.com/mrclrchtr/supi/blob/0044d91688737d084252cb6daeff924b33dbc179/packages/supi-web/src/web.ts), [git](https://github.com/mrclrchtr/supi/blob/0044d91688737d084252cb6daeff924b33dbc179/packages/supi-review/src/git-command.ts), [child session](https://github.com/mrclrchtr/supi/blob/0044d91688737d084252cb6daeff924b33dbc179/packages/supi-review/src/tool/child-session-runner.ts)).

Routing only `bash`, or even Pi's four core tools, cannot cover those paths. By contrast, when nono applies Seatbelt before `exec(pi)`, Pi and all of these descendants inherit the same irreversible policy. Starting an LSP in a detached process group does not remove an inherited Seatbelt label.

A Pi extension also cannot retroactively sandbox the already-running Pi process. A guard extension would be mutable under the accepted `~/.pi` policy and can be omitted with alternate Pi startup options. Enforcement therefore belongs in the command that launches Pi, not in the pack extension.

## nono: primitive and integration findings

### The primitive is the right shape

On macOS nono generates a deny-default Seatbelt profile, calls the private `sandbox_init()` API in the child, and only then execs the requested command. Its documented and implemented properties are irreversible kernel enforcement and inheritance by children ([Seatbelt design](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/docs/cli/internals/seatbelt.mdx), [profile/application source](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono/src/sandbox/macos.rs), [supervised child path](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono-cli/src/exec_strategy.rs)).

`--rollback` selects supervised execution. The nono parent remains unsandboxed so it can own the PTY, write audit/rollback state, and restore files; only nono's Rust supervisor runs there. Pi and its extensions execute in the sandboxed child. This is the correct trust split for the stated attacker, provided the supervisor interfaces and Seatbelt policy are sound ([security model](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/docs/cli/internals/security-model.mdx)).

The tradeoff against Gondolin is real: nono shares XNU, host userspace services, and the user's UID. It does not provide a separate kernel, memory boundary, filesystem namespace, or defense against a Seatbelt/kernel escape. That tradeoff matches the map's trusted-kernel, local-development scope and avoids moving Pi, Node, native dependencies, and LSPs into Linux.

### What the official pack actually installs

The signed registry pack `nolabs-ai/pi@0.1.0` was published from `nolabs-ai/nono-packs` tag `pi-v0.1.0`; the [registry pull manifest](https://registry.nono.sh/api/v1/packages/nolabs-ai/pi/versions/0.1.0/pull) observed on 2026-07-28 reported the expected [workflow identity](https://github.com/nolabs-ai/nono-packs/blob/0e0615eb14facb3101d5d858a802be973301d418/.github/workflows/publish-pi.yml), Rekor entry, and `scan_passed: true`. Its immutable source is commit [`0e0615e`](https://github.com/nolabs-ai/nono-packs/tree/0e0615eb14facb3101d5d858a802be973301d418/pi).

It provides three distinct things:

1. a registry-managed nono profile;
2. declarative wiring that appends the pack directory to Pi's package settings;
3. a Pi extension/skill that labels the session, augments the system prompt, and adds denial diagnostics.

The extension checks `NONO_CAP_FILE`; it never refuses an unsandboxed Pi launch and contains no enforcement primitive ([extension](https://github.com/nolabs-ai/nono-packs/blob/0e0615eb14facb3101d5d858a802be973301d418/pi/extensions/nono-sandbox.ts)). The README still tells the user to run an explicit command:

```text
nono run --profile pi --allow-cwd -- pi
```

It does not install an ordinary-`pi` launch interposition and does not add `--rollback` ([README](https://github.com/nolabs-ai/nono-packs/blob/0e0615eb14facb3101d5d858a802be973301d418/pi/README.md)).

The profile is compatibility-oriented rather than least-privilege ([policy](https://github.com/nolabs-ai/nono-packs/blob/0e0615eb14facb3101d5d858a802be973301d418/pi/policy.json)):

| Surface | Pack behavior | Implication |
| --- | --- | --- |
| Project | `workdir.access: readwrite`, but launch still needs `--allow-cwd` | Correct capability once the outer launcher supplies it. |
| Pi state | all of `$HOME/.pi` read/write | Matches the accepted limit; provides no Pi-token/package/settings confidentiality or integrity. |
| Runtime paths | Node, Rust, Python, Nix, git config, user caches, `~/.nvm`, skills, package/profile stores | Broad portability; some paths can contain credentials or mutable state and must be audited/narrowed where inheritance permits. |
| Network | `block: false` | Direct unrestricted networking; on macOS this also emits blanket system-socket, outbound, inbound, and bind permissions. |
| Environment | no `environment` section | All non-built-in-denied parent variables are inherited by default. |
| Rollback policy | exclusions for `node_modules`, `.next`, `__pycache__`, `target`, `.pi`, and temp globs | These are only filters if rollback is separately requested; `.pi` also matches a project-local `.pi`. |
| Elevation | `capability_elevation: false` | Good: the running agent cannot ask the supervisor for new filesystem capability. |
| Browser | origin allowlist plus profile opt-in for Launch Services | The launch surface should not add `--allow-launch-services`; retain only the constrained URL delegation needed by tested login flows. |

The underlying [nono group definitions](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono-cli/data/policy.json) make the breadth concrete: `user_caches_macos` writes all of `~/Library/Caches`, `~/Library/Logs`, and `~/.cache`; `rust_runtime` reads all of `~/.cargo`, where registry credentials may live; and `system_read_macos` reads broad roots including `/private`, `/Volumes`, and `/opt`. These grants exceed the map's two explicit accepted surfaces unless removed, carved down, or separately accepted.

The manifest accepts any Pi peer version and only requires nono `>=0.55.0` ([manifest](https://github.com/nolabs-ai/nono-packs/blob/0e0615eb14facb3101d5d858a802be973301d418/pi/package.json)). Neither range is an adequate SuPi compatibility/security pin.

### Coverage versus compatibility

Whole-process placement gives nono the correct **coverage**: in-process tools, custom extensions, web tools, review/subsessions, shell children, and LSP/tsserver descendants cannot acquire filesystem access beyond the Pi child's Seatbelt profile.

It does not prove **compatibility**. The exact current global package set, native TUI behavior, provider login/open-URL flow, runtime-manager layout, and TypeScript LSP startup still require a macOS prototype. Missing grants should fail closed and become reviewed changes to a trusted user profile; project files must never be allowed to alter the active outer profile.

## Rollback is useful but narrower than the name suggests

With `--rollback`, nono automatically snapshots writable user/profile directory grants before execution, snapshots again after exit, records a diff, and can restore regular files ([documentation](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/docs/cli/features/atomic-rollbacks.mdx), [root derivation/runtime](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono-cli/src/rollback_runtime.rs)). Baseline failure occurs before Pi starts, which is a useful fail-closed property.

The final specification must preserve these limits:

- rollback is opt-in at the CLI, not enabled by the Pi pack;
- restore is post-exit and user-selected, with `N` as the default;
- `.gitignore`, profile patterns, built-in patterns, dynamically detected heavy directories, a 300,000-entry budget, and a 2 GiB walk budget can omit data or abort capture;
- the pack excludes `.pi`, and nono normally excludes VCS directories; a complete project baseline therefore needs a tested way to force-include the exact project root or an upstream strict-workspace mode;
- unreadable individual files are warned and skipped rather than making the entire snapshot fail;
- current main tracks regular-file contents and records Unix mode, detects created/modified/deleted files, and removes newly created symlinks, but permission-only changes are detected without being restored and a symlink that existed at baseline and was deleted is not recreated; empty directories, ownership, timestamps, ACLs, and extended attributes are not a complete transactional image;
- a crash, `SIGKILL`, power loss, or final-snapshot failure is not equivalent to an atomic filesystem transaction.

Most importantly, released nono 0.69.0 calls `Path::is_file()` while walking entries, which follows symlinks and can cause the unsandboxed rollback supervisor to read/copy a target outside the intended tree ([0.69 source](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono/src/undo/snapshot.rs)). Upstream issue [#1480](https://github.com/nolabs-ai/nono/issues/1480) demonstrated the behavior through duplicated target sizes. The merged, post-release fix [#1493](https://github.com/nolabs-ai/nono/pull/1493), commit [`d322771`](https://github.com/nolabs-ai/nono/commit/d3227716c3ed735c72892ac9fdc8e528538284f5), explicitly separates symlinks from files and avoids hashing their targets. A rollback-required SuPi integration must require a released version containing that fix and include malicious-symlink regression tests.

## Security and operational limitations the specification must carry forward

### Hard release gates

1. **No currently approved nono release.** [`0.69.0`](https://github.com/nolabs-ai/nono/releases/tag/v0.69.0) is the latest release reviewed here and lacks the rollback symlink fix. Do not pin an unreleased branch implicitly; either wait for a signed release containing the fix or deliberately own and verify a source build.
2. **Deny/allow correctness.** Open issue [#1519](https://github.com/nolabs-ai/nono/issues/1519) reproduces on 0.69.0 that `nono why` reports a required keychain deny while `nono run` permits the read after a more-specific group allow. It is not evidence that the exact Pi profile currently grants that keychain path, but it invalidates policy simulation as proof and shows that overlapping grants require an upstream fix plus real syscall tests.
3. **Host-control IPC.** In `NetworkMode::AllowAll`, nono emits blanket AF_UNIX/IP outbound, inbound, and bind permissions ([source](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/crates/nono/src/sandbox/macos.rs)). Earlier issue [#483](https://github.com/nolabs-ai/nono/issues/483) demonstrated Docker escape when an exact socket network deny was absent. The Pi profile does not enumerate exact container/SSH-agent/other authority sockets. The hardened policy must deny AF_UNIX by default with explicit necessities, or at minimum deny and behaviorally probe every supported host-control socket. If nono cannot express that while preserving unrestricted IP egress, release remains blocked pending an upstream structured mode or a separately reviewed Seatbelt rule. An accessible container daemon is a sandbox escape, not an accepted egress risk.
4. **End-to-end compatibility.** The native provider/TUI flow, core and web tools, review/subsessions, and a representative TypeScript LSP/tsserver tree must pass under the exact profile and launch command on supported macOS/terminal combinations.

### Required policy constraints

- Add an explicit, compatibility-tested `environment.allow_vars` list. Nono otherwise inherits every parent variable; with open egress, inherited tokens are immediately exfiltratable ([environment semantics](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/docs/cli/features/environment.mdx)). Provider keys, `CONTEXT7_API_KEY`, `GH_TOKEN`, cloud credentials, `SSH_AUTH_SOCK`, and similar values should be absent by default and enabled individually with explicit exposure semantics.
- Exclude the broad `user_caches_macos` group unless the compatibility prototype proves it necessary; add back narrow paths. Review whether Rust, Python, and Nix runtime groups are needed for the supported TypeScript flow. Group exclusions are structured profile features, so this does not require new sandbox code.
- Treat runtime manager and LSP grants as a versioned allowlist. `PATH` presence alone is not a filesystem grant.
- Keep the active profile, launcher, rollback store, and nono package lock outside the project and outside mutable `~/.pi`.
- Never auto-promote agent-authored profile drafts. Open issue [#1505](https://github.com/nolabs-ai/nono/issues/1505) shows denial recovery can suggest a whole-home grant for one missing file; display the exact diff and require an out-of-sandbox operator action.
- Do not promise nono credential-broker protection for Pi's Anthropic OAuth. Open issue [#1486](https://github.com/nolabs-ai/nono/issues/1486) documents that nono's phantom token shape breaks Pi's OAuth-prefix detection. The map already accepts Pi-native OAuth files in `~/.pi`; use that accepted path until compatibility is proven.

### Maturity and support constraints

nono's own [`SECURITY.md`](https://github.com/nolabs-ai/nono/blob/59bdace7e905c05c127f480dc6d2a8c3a3331392/SECURITY.md) calls the project alpha, says guarantees are unstable, advises against production use, and lists a third-party audit as future work. The integration should be labeled experimental until that posture changes and SuPi's gates pass.

Operationally relevant open issues include standard-user denial diagnostics failing silently ([#1431](https://github.com/nolabs-ai/nono/issues/1431)), terminal-control replies leaking after Pi exits in kitty ([#1255](https://github.com/nolabs-ai/nono/issues/1255)), and broader PTY/multiplexer scope concerns ([#1517](https://github.com/nolabs-ai/nono/issues/1517)). These do not show a Seatbelt bypass, but they are release/support matrix inputs for a TUI-first product.

The macOS release binaries were also reported unsigned and unnotarized in [#1224](https://github.com/nolabs-ai/nono/issues/1224). A published installer must verify an immutable release and architecture-specific digest; enterprise/Gatekeeper support remains an upstream limitation.

## Candidate comparison

| Requirement / property | nono + official Pi pack | Gondolin current Pi approach | Anthropic sandbox-runtime current Pi approach |
| --- | --- | --- | --- |
| Primitive | Same-kernel Seatbelt applied before Pi exec; inherited by full tree | QEMU Linux VM; strongest compute boundary for code actually run in guest | Same-kernel `sandbox-exec` Seatbelt; CLI can wrap a whole tree |
| Current Pi integration coverage | Pack extension is diagnostic, but an outer `nono run … -- pi` covers Pi, extensions, tools, and descendants | Adapter redirects Pi `read`/`write`/`edit`/`bash` and `!`; Pi, custom extensions/tools, web fetches, and SuPi LSP remain host-side | Pi example redirects `bash` and `!`; all other Pi/SuPi execution remains host-side |
| Ordinary `pi` fail-closed | No, not from pack; thin outer launcher required | No; extension must be explicitly loaded and VM errors occur after host Pi starts | No; example accepts `--no-sandbox`/project disable and falls back to unsandboxed Bash after init failure |
| Native macOS/TUI/provider compatibility | Native process; structurally best fit, but must be prototyped | Guest is Alpine/Linux; whole-Pi placement needs a custom image and terminal bridge | Native process; whole-process use needs `allowPty` and current PTY issues tested |
| Current SuPi TypeScript LSP boundary | Covered automatically as Pi child process | Host process under current adapter; moving it requires Linux server/toolchain plumbing | Covered only if the CLI wraps all of Pi, not by the Pi example |
| Project read/write | Yes | `RealFSProvider` writes host workspace directly | Yes with filesystem policy |
| Required rollback | Built in but opt-in and partial; current release has symlink flaw | Checkpoints cover guest root disk, **not VFS/host workspace** | None |
| Unrestricted egress while retaining filesystem policy | Yes, but over-broad local IPC/bind semantics need mitigation | Possible policy choice; stronger host-network mediation is available | Not representable in validated config today; tracked by [#253](https://github.com/anthropic-experimental/sandbox-runtime/issues/253) |
| Distribution/integration asset | Signed official nono Pi pack, young at 0.1.0 | Example, not a packaged full-stack Pi boundary | Pi repository example, not an Anthropic Pi pack |
| Fit | **Selected conditionally** | Not selected for this trusted-kernel/native-compatibility scope | Not selected; would require a new launcher, network change, and rollback implementation |

### Why not Gondolin here

Gondolin's security model is strong and explicit: untrusted code executes in a QEMU guest and host filesystem/network access is mediated ([security design](https://github.com/earendil-works/gondolin/blob/29fa74d802112f29c720990aced26165e0d57d84/docs/security.md)). That is the better primitive if the host kernel/userspace boundary is in scope.

The current Pi integration is not that boundary. Its source overrides four built-ins and user shell commands, mounts the project through `RealFSProvider`, and forwards tool environment into the guest ([Pi example](https://github.com/earendil-works/gondolin/blob/29fa74d802112f29c720990aced26165e0d57d84/host/examples/pi-gondolin.ts)); environment exposure remains open as [#11](https://github.com/earendil-works/gondolin/issues/11). SuPi custom tools and its LSP spawn path never enter the VM.

Gondolin's disk checkpoints capture only the guest root disk, not VFS mounts such as the host workspace ([snapshot limitations](https://github.com/earendil-works/gondolin/blob/29fa74d802112f29c720990aced26165e0d57d84/docs/snapshots.md)). A workspace transaction would require a new provider/COW layer. Running all of Pi in the VM would instead require packaging Pi, the current SuPi stack, Node, and TypeScript language-server for Alpine/Linux; Gondolin documents Alpine-only image building and custom images for extra packages ([limitations](https://github.com/earendil-works/gondolin/blob/29fa74d802112f29c720990aced26165e0d57d84/docs/limitations.md)). That is substantially more integration code for a threat excluded by the map.

### Why not sandbox-runtime here

Anthropic sandbox-runtime's CLI can wrap arbitrary processes and its macOS profile applies to the resulting process tree ([README](https://github.com/anthropic-experimental/sandbox-runtime/blob/f869f5af7b432070e8c52413dad59c1c3db98903/README.md), [macOS wrapper](https://github.com/anthropic-experimental/sandbox-runtime/blob/f869f5af7b432070e8c52413dad59c1c3db98903/src/sandbox/macos-sandbox-utils.ts)). In primitive placement it could be made similar to nono.

Its available Pi example is materially weaker: it replaces only Bash operations, permits command-line and project-config disabling, and on initialization error sets `sandboxEnabled = false`, after which it executes the ordinary local Bash tool ([Pi example](https://github.com/earendil-works/pi/blob/b4f293684bba718d59cc1157679bcf6157b3a7f5/packages/coding-agent/examples/extensions/sandbox/index.ts)). That is fail-open and project-controlled.

Using the CLI outside Pi would fix coverage, but two fixed requirements remain absent: there is no rollback facility, and the required `network.allowedDomains` model has no “filesystem sandbox with unrestricted direct network” switch. Upstream tracks the latter in [#253](https://github.com/anthropic-experimental/sandbox-runtime/issues/253). The project labels itself a beta research preview, and whole-Pi TUI use also needs explicit PTY configuration and validation against open reports such as [#419](https://github.com/anthropic-experimental/sandbox-runtime/issues/419). Building the missing launch, policy, and rollback layers would duplicate what nono already owns.

## Required SuPi integration boundary

The later implementation specification should require the following behavior, independent of final artifact names.

### Install/update surface

1. Install or verify an exact macOS/architecture nono release and digest. Do not accept the pack's `>=0.55.0` floor.
2. Pull an exact `nolabs-ai/pi` version during install/update, verify expected Sigstore publisher provenance, and pin it. Ordinary launch must not auto-update or silently auto-pull.
3. Install a reviewed SuPi child profile outside the project. It should extend the upstream profile only where inherited grants are acceptable, exclude unnecessary compatibility groups, add the minimal environment policy, and carry a content hash/version.
4. Install one canonical `pi` shim/launcher ahead of the real Pi binary and verify command resolution. A shell alias alone is not a reliable install boundary.
5. Record the real Pi executable by absolute, non-recursive path and support only a tested Pi version/range.

### Ordinary launch surface

The conceptual command is:

```text
<absolute-nono> run \
  --profile <trusted-pinned-profile> \
  --allow-cwd \
  --rollback \
  <strict-project-rollback-inclusion> \
  -- <absolute-real-pi> <user-args...>
```

The implementation must:

- refuse unsupported OS/version/architecture, missing or mismatched nono, missing profile/pack, invalid provenance/hash, unresolved real Pi, and rollback-baseline failure;
- never fall back to the real Pi directly;
- keep all nono options before `--` and pass all user Pi arguments after it, so Pi arguments cannot disable the outer boundary;
- use absolute trusted paths rather than project-controlled `PATH` resolution for nono and Pi;
- make rollback inclusion cover the exact project despite `.gitignore`, `.git`, `.pi`, and pack exclusions, or explicitly list accepted rollback omissions;
- avoid enabling direct Launch Services; use only tested, origin-constrained browser delegation;
- expose sandbox/profile/version status, but treat status as observability rather than proof of enforcement.

Maintenance and emergency bypass should be separate, conspicuously named operator commands. They must not be flags accepted by ordinary `pi` and must never be selected by project configuration.

### Verification and update gate

Every supported profile/version tuple should pass real behavioral tests on macOS, not just `nono why` or dry-run output:

- denied reads/writes outside the project and accepted `~/.pi` surface, including keychains, SSH/cloud credentials, shell history/config, another repository, mounted volumes, and persistence/autostart locations;
- denial of Docker, Podman, OrbStack/Colima, SSH-agent, and other detected host-authority sockets while ordinary external network access succeeds;
- allowed project and `~/.pi` reads/writes with no capability elevation;
- rollback of created/modified/deleted regular files, malicious symlinks to outside files, gitignored files, `.git`, project `.pi`, interruption, budget failure, and post-exit/manual recovery;
- provider request/login flow, terminal resize/raw mode/bracketed paste/control keys, core tools, web tools, review child sessions, and representative TypeScript LSP plus tsserver descendants;
- proof from a custom SuPi tool and an LSP subprocess that a forbidden host write receives `EPERM`.

Upgrades must diff the nono release, built-in policy, official Pi pack, and Pi API; rerun the complete matrix; and require an explicit pin update. The alpha status and unresolved release gates should remain visible in user-facing documentation.

## Reviewed primary-source snapshots

| Component | Reviewed immutable ref | Notes |
| --- | --- | --- |
| SuPi | [`0044d916`](https://github.com/mrclrchtr/supi/tree/0044d91688737d084252cb6daeff924b33dbc179) | Runtime/LSP integration traced from the ticket's starting commit. |
| Pi | [`v0.82.1` / `b4f2936`](https://github.com/earendil-works/pi/tree/b4f293684bba718d59cc1157679bcf6157b3a7f5) | Security docs and both sandbox examples. |
| nono release | [`v0.69.0` / `59bdace`](https://github.com/nolabs-ai/nono/tree/59bdace7e905c05c127f480dc6d2a8c3a3331392) | Latest release as of research date; candidate behavior, not an approved SuPi pin. |
| nono main | [`ce3e510`](https://github.com/nolabs-ai/nono/tree/ce3e510146b0b603970ff087700e25448987fbc1) | Used to inspect post-release fixes; do not treat as a release artifact. |
| nono Pi pack | [`pi-v0.1.0` / `0e0615e`](https://github.com/nolabs-ai/nono-packs/tree/0e0615eb14facb3101d5d858a802be973301d418/pi) | Current signed `nolabs-ai/pi` pack content. |
| Gondolin release/main | [`v0.12.0` / `6283697`](https://github.com/earendil-works/gondolin/tree/628369764fcd2c987b4b99e5159ec90d4febe53a), [`29fa74d`](https://github.com/earendil-works/gondolin/tree/29fa74d802112f29c720990aced26165e0d57d84) | Release plus current Pi adapter/docs reviewed. |
| sandbox-runtime release/main | [`v0.0.68` / `f869f5a`](https://github.com/anthropic-experimental/sandbox-runtime/tree/f869f5af7b432070e8c52413dad59c1c3db98903), [`295f0e1`](https://github.com/anthropic-experimental/sandbox-runtime/tree/295f0e1af832131efe40db22f2c65a57f461d849) | Current release and post-release source reviewed. |
