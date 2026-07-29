#!/usr/bin/env bash
# PROTOTYPE — answers whether the current SuPi/Pi stack runs inside the official
# nono Pi profile on macOS, and records the grants or incompatibilities exposed.
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
real_home=$HOME
real_settings=$real_home/.pi/agent/settings.json
real_auth=$real_home/.pi/agent/auth.json
report=$repo_root/nono-prototype-report.log
nono_bin=$(command -v nono)
pnpm_bin=$(command -v pnpm)
node_bin=$(realpath "$(command -v node)")
node_root=$(dirname "$(dirname "$node_bin")")
pi_cli=$node_root/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js
fresh_login=${SUPI_NONO_FRESH_LOGIN:-0}

[[ $(uname -s) == Darwin ]] || { echo "macOS is required" >&2; exit 1; }
[[ $(uname -m) == arm64 ]] || { echo "This prototype currently covers arm64 only" >&2; exit 1; }
[[ $($nono_bin --version) == "nono 0.69.0" ]] || { echo "nono 0.69.0 is required" >&2; exit 1; }
[[ -f $real_settings ]] || { echo "Pi settings are required" >&2; exit 1; }
[[ $fresh_login == 1 || -f $real_auth ]] || { echo "Pi auth is required" >&2; exit 1; }

sandbox=$(mktemp -d "$real_home/.supi-nono-prototype.XXXXXX")
workspace=$sandbox/workspace
chmod 700 "$sandbox"
cleanup() { rm -rf "$sandbox"; }
trap cleanup EXIT INT TERM
: > "$report"

log() { printf '%s\n' "$*" | tee -a "$report"; }
run_nono() {
  env -i \
    HOME="$HOME" \
    XDG_CONFIG_HOME="$XDG_CONFIG_HOME" \
    XDG_DATA_HOME="$XDG_DATA_HOME" \
    XDG_STATE_HOME="$XDG_STATE_HOME" \
    XDG_CACHE_HOME="$XDG_CACHE_HOME" \
    PATH="$node_root/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
    TMPDIR="${TMPDIR:-/tmp}" \
    TERM="${TERM:-xterm-256color}" \
    COLORTERM="${COLORTERM:-truecolor}" \
    LANG="${LANG:-en_US.UTF-8}" \
    USER="${USER:-$(id -un)}" \
    LOGNAME="${LOGNAME:-$(id -un)}" \
    SHELL=/bin/zsh \
    NONO_NO_SAVE_PROMPT=1 \
    SUPI_LOG_STATUS=1 \
    "$nono_bin" "$@"
}
run_logged() {
  local output=$HOME/.pi/nono-command.log
  if run_nono "$@" < /dev/null > "$output" 2>&1; then
    cat "$output" >> "$report"
  else
    cat "$output" >> "$report"
    return 1
  fi
}

log "Question: Does current SuPi work end to end inside nono 0.69.0's official Pi profile?"
log "Setup: disposable clone and HOME at $sandbox (deleted on exit)"
log "Installing workspace dependencies from the existing pnpm store..."
git clone --quiet --local --no-hardlinks "$repo_root" "$workspace"
(
  cd "$workspace"
  CI=1 "$pnpm_bin" install --offline --frozen-lockfile
) >> "$report" 2>&1

export HOME=$sandbox/home
export XDG_CONFIG_HOME=$sandbox/config
export XDG_DATA_HOME=$sandbox/data
export XDG_STATE_HOME=$sandbox/state
export XDG_CACHE_HOME=$sandbox/cache
mkdir -p "$HOME/.pi/agent" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_STATE_HOME" "$XDG_CACHE_HOME"

log "Pulling the signed nolabs-ai/pi@0.1.0 pack into the disposable HOME..."
"$nono_bin" pull nolabs-ai/pi@0.1.0 >> "$report" 2>&1
pack_packages=$(jq -c '.packages' "$HOME/.pi/agent/settings.json")
jq --argjson packages "$pack_packages" \
  '.packages = $packages | .defaultProjectTrust = "always"' \
  "$real_settings" > "$HOME/.pi/agent/settings.json.tmp"
mv "$HOME/.pi/agent/settings.json.tmp" "$HOME/.pi/agent/settings.json"
if [[ $fresh_login != 1 ]]; then
  install -m 600 "$real_auth" "$HOME/.pi/agent/auth.json"
fi
if [[ -f $real_home/.pi/agent/supi/config.json ]]; then
  mkdir -p "$HOME/.pi/agent/supi"
  install -m 600 "$real_home/.pi/agent/supi/config.json" "$HOME/.pi/agent/supi/config.json"
fi

"$nono_bin" profile init supi-prototype --extends nolabs-ai/pi --full >> "$report" 2>&1
profile=$XDG_CONFIG_HOME/nono/profiles/supi-prototype.json
jq --arg node_root "$node_root" --arg sandbox "$sandbox" '
  .filesystem.read += [$node_root]
  | .filesystem.suppress_save_prompt += [$sandbox]
  | .allow_launch_services = false
  | .interactive = false
' "$profile" > "$profile.tmp"
mv "$profile.tmp" "$profile"
"$nono_bin" profile validate "$profile" >> "$report" 2>&1

cd "$workspace"
log "Checking workspace access and denial outside the sandbox boundary..."
printf 'blocked' > "$sandbox/outside-read.txt"
if run_logged run --profile supi-prototype --allow-cwd -- /bin/sh -c '
  cat "$1" >/dev/null 2>&1 && exit 91
  printf blocked > "$2" 2>/dev/null && exit 92
  printf allowed > .nono-workspace-write
' sh "$sandbox/outside-read.txt" "$sandbox/outside-write.txt"; then
  [[ $(cat .nono-workspace-write) == allowed && ! -e $sandbox/outside-write.txt ]]
  rm .nono-workspace-write
  log "PASS: workspace read/write allowed; outside read/write denied"
else
  log "FAIL: filesystem boundary check"
  exit 1
fi

log "Checking unrestricted outbound HTTPS..."
run_logged run --profile supi-prototype --allow-cwd -- /usr/bin/curl -fsS -o /dev/null https://example.com/
log "PASS: outbound HTTPS"

log "Checking Pi startup and OpenAI Codex OAuth..."
if [[ $fresh_login == 1 ]]; then
  log "SKIP: provider request deferred to the fresh-login TUI"
elif [[ ${SUPI_NONO_SKIP_PROVIDER:-0} == 1 ]]; then
  log "SKIP: provider request disabled for this rerun"
else
  provider_log=$HOME/.pi/provider.log
  run_nono run --profile supi-prototype --allow-cwd --rollback --no-rollback-prompt -- \
    "$pi_cli" --approve --no-session --no-tools -p 'Reply exactly SUPI_NONO_PROVIDER_OK' \
    < /dev/null > "$provider_log" 2>&1
  cat "$provider_log" >> "$report"
  grep -q 'SUPI_NONO_PROVIDER_OK' "$provider_log"
  log "PASS: provider response"
fi

log "Checking registered Pi, SuPi, and nono tools without another model call..."
inventory_log=$HOME/.pi/inventory.log
printf '{"type":"get_state","id":"inventory"}\n' | \
  run_nono run --profile supi-prototype --allow-cwd -- \
    "$pi_cli" --approve --no-session --mode rpc > "$inventory_log" 2>&1
cat "$inventory_log" >> "$report"
status=$(grep '^SUPI_STATUS ' "$inventory_log" | tail -1 | sed 's/^SUPI_STATUS //')
for tool in read bash edit write ask_user supi_context supi_review_run code_resolve code_health web_fetch_md; do
  jq -e --arg tool "$tool" '.tools.registered | index($tool) != null' <<< "$status" >/dev/null
done
jq -e '.commands | index("nono-status") != null' <<< "$status" >/dev/null
log "PASS: expected Pi/SuPi tools and nono command registration"
printf '%s\n' "$status" | jq '{registered_tools: .tools.registered, commands: .commands}' >> "$report"

if [[ -t 0 && -t 1 && ${SUPI_NONO_SKIP_TUI:-0} != 1 ]]; then
  if [[ $fresh_login == 1 ]]; then
    cat <<'CHECKLIST'

Fresh-login check (the HOME is disposable and direct Launch Services are off):
  1. Run /login and choose OpenAI Codex.
  2. Complete the browser/callback flow.
  3. Send one short prompt and verify a response.
  4. Exit Pi and confirm nono offers rollback review.

CHECKLIST
  else
    cat <<'CHECKLIST'

Manual TUI checklist (the workspace and HOME are disposable):
  1. Resize the terminal, paste text, and verify normal input/rendering.
  2. Run /nono-status.
  3. Ask Pi to use read and bash on package.json.
  4. Ask it to call web_fetch_md for https://example.com/.
  5. Ask it to call code_health, then resolve maybeLogLoadStatus in
     packages/supi-debug/src/status-log.ts (real TypeScript LSP flow).
  6. Ask it to run one direct review task against commit HEAD (subsession flow).
  7. Exit Pi and confirm nono offers rollback review.

CHECKLIST
  fi
  run_nono run --profile supi-prototype --allow-cwd --rollback -- "$pi_cli" --approve
  "$nono_bin" audit list --recent 10 --json >> "$report"
  "$nono_bin" rollback list --path "$workspace" --json >> "$report"
else
  log "Manual TUI checklist skipped because this run has no terminal."
fi

log "Checking rollback capture and restore for ordinary files..."
auth_before_rollback=0
[[ -f $HOME/.pi/agent/auth.json ]] && auth_before_rollback=1
printf before > .nono-rollback-existing
run_logged run --profile supi-prototype --allow-cwd --rollback --no-rollback-prompt -- /bin/sh -c '
  printf after > .nono-rollback-existing
  printf created > .nono-rollback-created
'
rollback_id=$("$nono_bin" rollback list --path "$workspace" --json | jq -r '.[0].session_id')
"$nono_bin" rollback restore "$rollback_id" --snapshot 0 >> "$report" 2>&1
[[ $(cat .nono-rollback-existing) == before && ! -e .nono-rollback-created ]]
rm .nono-rollback-existing
if [[ ! -f .pi/settings.json || $auth_before_rollback == 1 && ! -f $HOME/.pi/agent/auth.json ]]; then
  log "INCOMPATIBLE: restoring snapshot 0 removed pre-existing Pi auth/settings excluded by the pack's .pi rollback pattern"
else
  log "PASS: rollback restored a modified file and removed a created file"
fi

log "Prototype report: $report"
log "Known exclusion: nono 0.69.0's malicious-symlink rollback case was not run."
