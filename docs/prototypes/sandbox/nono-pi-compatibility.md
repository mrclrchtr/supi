# Prototype: SuPi and TypeScript LSP inside nono on macOS

> **Throwaway prototype.** Primary-source evidence for [Prototype SuPi and TypeScript LSP inside nono on macOS](https://github.com/mrclrchtr/supi/issues/247), not production code or a supported launcher.

## Question

Does the current Pi/SuPi stack work end to end inside the official nono Pi profile on macOS, and which concrete grants or incompatibilities appear?

## Verdict

**The Pi/SuPi runtime is compatible, but nono 0.69.0 plus `nolabs-ai/pi@0.1.0` is not safe to ship with required rollback.** The TUI, existing and fresh OpenAI Codex OAuth, built-in and SuPi tools, unrestricted web access, review child sessions, and a real TypeScript LSP/tsserver flow all passed in a disposable setup. The profile needed one runtime-manager read grant and a fail-closed launcher setting that disables nono's post-run profile-save UI.

Rollback correctly restored an ordinary modified file and removed an ordinary created file. However, restoring snapshot 0 also deleted pre-existing Pi authentication, settings, session/config files, and project `.pi` files that the pack's `.pi` exclusion had omitted from the baseline. That is a release-blocking data-loss behavior until its cause and fixed-version boundary are established.

## Tested tuple

| Component | Tested value |
| --- | --- |
| Host | macOS 26.5.2, arm64 |
| nono | Homebrew `0.69.0` |
| nono Pi pack | signed `nolabs-ai/pi@0.1.0` |
| Pi | `0.82.1` |
| Pi Node runtime | mise Node `24.15.0` |
| TypeScript language server | Homebrew `typescript-language-server 5.3.0` |
| Workspace TypeScript | `6.0.3` |
| SuPi | current project package from this branch's disposable clone |

The harness used a mode-0700 disposable HOME and local clone, copied auth only for the existing-OAuth run, installed dependencies from the existing pnpm store, and deleted the setup on exit.

The child profile extended `nolabs-ai/pi`, added read access to the exact mise Node installation, set `allow_launch_services: false`, and suppressed save suggestions under the disposable root. The launcher passed a minimal environment rather than inheriting the host environment and set `NONO_NO_SAVE_PROMPT=1`.

## Results

| Surface | Result | Evidence |
| --- | --- | --- |
| Workspace read/write | Pass | Sandboxed shell wrote the clone. |
| Outside-project read/write | Pass | Both operations were denied. |
| Unrestricted HTTPS | Pass | Sandboxed `/usr/bin/curl https://example.com/` succeeded. |
| Pi/SuPi load | Pass | RPC inventory contained built-ins plus `ask_user`, Context, Review, Code intelligence, and Web tools; the nono status command loaded. |
| Existing provider auth | Pass | A sandboxed Pi print run used the copied OpenAI Codex OAuth state and returned the exact expected response. |
| Fresh provider login | Pass | `/login` opened and completed the OpenAI Codex browser/callback flow, then the provider responded, with direct Launch Services disabled. |
| Pi TUI | Pass | Resize, paste, input, rendering, status command, and normal exit passed in the live HITL run. |
| Built-in tools | Pass | `read` and `bash` completed inside the sandbox. |
| SuPi web | Pass | `web_fetch_md` completed against `https://example.com/`. |
| TypeScript LSP | Pass | `code_health` and target resolution completed; two sandboxed workspace `tsserver` descendants were observed. |
| Review/subsessions | Pass | A direct review task against `HEAD` completed. |
| Rollback prompt | Pass | The supervised Pi run reached post-exit rollback review. |
| Ordinary rollback | Pass | Snapshot 0 restored a modified file and removed a created file. |
| Excluded `.pi` rollback | **Fail** | Snapshot-0 restore removed pre-existing global and project Pi state omitted by the pack's `.pi` exclusion. |

## Concrete profile and launcher findings

1. **Grant the actual runtime-manager installation.** The official `node_runtime` group does not cover mise. This machine needed read access to `$HOME/.local/share/mise/installs/node/24.15.0`; a final profile should use the narrow tested versioned path or a reviewed mise group.
2. **Keep direct Launch Services disabled.** Fresh OpenAI Codex login succeeded with `allow_launch_services: false`; the constrained browser delegation/callback path is sufficient for this provider.
3. **Use an explicit environment allowlist.** Pi, OAuth, TUI, web, Review, and TypeScript LSP worked with only HOME/XDG paths, a narrow PATH, terminal/locale/user variables, and SuPi/nono control variables. Broad host environment inheritance was unnecessary.
4. **Disable runtime save suggestions in the outer launcher.** In nono 0.69.0, profile `interactive` is deprecated and ignored, and post-run suggestions open `/dev/tty` even when stdin/stdout are redirected. `NONO_NO_SAVE_PROMPT=1` was required for deterministic fail-closed runs. Without it, a deliberate denial offered a broad parent grant; accepting it made the next run fail because it overlapped nono's protected state root.
5. **Do not grant the observed preferences denial by default.** Curl and Pi emitted `user-preference-read (kcfpreferencesanyapplication)` diagnostics, but every tested flow still passed. Adding the suggested raw `(allow user-preference-read)` Seatbelt rule would widen policy without demonstrated need.
6. **Block release on rollback exclusion safety.** Do not expose restore while `.pi` or another pre-existing path can be absent from the baseline yet removed during restore.

## Not established

- The known nono 0.69.0 malicious-symlink rollback case was not run.
- Docker/Podman/OrbStack/Colima/SSH-agent and other host-authority sockets were not probed here.
- No terminal matrix beyond the operator's current terminal was exercised.
- Install/update/uninstall and ordinary-`pi` command interposition belong to the publication-surface decision.

## Run

```bash
pnpm prototype:nono
```

Fresh-login mode:

```bash
SUPI_NONO_FRESH_LOGIN=1 pnpm prototype:nono
```
