# Terminal-Bench comparison workflow

This document captures the simplest-first workflow for comparing **plain pi** and **full SuPi** with Terminal-Bench without building or vendoring a benchmark harness.

Harbor already supports pi out of the box, so the primary workflow uses Harbor's built-in `pi` agent. The separate `badlogic/pi-terminal-bench` repository is useful context, but it is not required for the first comparison path.

## Current tool references

Primary benchmark runner:

```text
repo: https://github.com/harbor-framework/harbor
installed CLI: harbor 0.5.0
agent: -a pi
```

Terminal-Bench dataset target:

```text
terminal-bench@2.0
```

Optional/reference adapter inspected during reconnaissance:

```text
repo: https://github.com/badlogic/pi-terminal-bench
local checkout: /Users/mrclrchtr/Development/public/pi-terminal-bench
commit: 0074c915dc7d8ceeba5f61b19e7b9aa078564fa3
```

## Reconnaissance summary

Harbor `0.5.0` includes a built-in `pi` installed agent at `harbor.agents.installed.pi.Pi`.

The built-in agent:

- installs `@earendil-works/pi-coding-agent` into the task environment
- runs pi in JSON mode with a command equivalent to:

  ```bash
  pi --print --mode json --no-session \
    --provider <provider> --model <model> \
    <instruction>
  ```

- accepts Harbor's normal `-a pi` agent selection
- accepts model selection with `-m provider/model`
- accepts selected pi CLI flags exposed by Harbor, currently including `--ak thinking=<level>`
- writes pi JSON output to Harbor agent logs as `pi.txt`
- parses `message_end` usage data from `pi.txt` into Harbor context fields:
  - input tokens, including cache reads
  - output tokens
  - cache tokens
  - total cost when pi reports it

The inspected `badlogic/pi-terminal-bench` adapter also parses pi JSON output, but it is not needed for the first Harbor-native workflow.

## Harbor `upload_dir` fix check

Older `pi-terminal-bench` documentation describes a Harbor verifier issue involving `upload_dir()` and `/tests`. For Harbor `0.5.0`, the installed implementation already copies directory contents with `source_dir/.`:

```python
[
    "cp",
    f"{source_dir}/.",
    f"main:{target_dir}",
]
```

Check the installed Harbor implementation with the Python from the `uv tool` environment:

```bash
/Users/mrclrchtr/.local/share/uv/tools/harbor/bin/python - <<'PY'
import inspect
from harbor.environments.docker.docker import DockerEnvironment
src = inspect.getsource(DockerEnvironment.upload_dir)
print(src)
print("USES_SOURCE_DOT", "{source_dir}/." in src or "/." in src)
PY
```

Do not apply the older one-line patch blindly if Harbor has already changed the function. Record the observed Harbor version and function body in benchmark notes.

## Oracle validation

Before running any pi variant, validate the Terminal-Bench/Harbor setup:

```bash
harbor run \
  -d terminal-bench@2.0 \
  -a oracle \
  --jobs-dir ./tbench-results/oracle-smoke \
  --n-tasks 1 \
  -n 1
```

Acceptance gate:

- Harbor starts successfully.
- Docker/environment setup succeeds.
- A native result artifact appears under the selected jobs directory.
- The oracle reward is successful for the selected smoke task.
- Any failure is understood as an environment/setup issue before agent comparisons continue.

On Apple Silicon or other emulated Docker setups, an oracle run can fail even without Harbor exceptions if the verifier segfaults under QEMU. For example, a `qemu: uncaught target signal 11 (Segmentation fault)` in `verifier/test-stdout.txt` means the local environment is not a reliable benchmark substrate for that task. In a tested Podman `libkrun` VM, `podman machine ssh "sudo touch /etc/containers/enable-rosetta"` plus restart created the marker but left `podman machine inspect --format '{{.Rosetta}}'` false, did not create `/mnt/rosetta`, left amd64 binfmt on `qemu-x86_64-static`, and did not fix the segfault. In a tested Podman `applehv` VM, Rosetta initially reported true but amd64 still used QEMU; after creating `/etc/containers/enable-rosetta` and restarting, `/mnt/rosetta` existed, binfmt used `rosetta`, and the Python/PyArrow reproducer passed. The `gpt2-codegolf` oracle task still failed later in its compiled program, so use a smoke task whose oracle passes (or exclude `gpt2-codegolf` for local smoke), and prefer native Linux/amd64 or a supported Harbor cloud environment for benchmark claims.

## Plain pi smoke run

Use a tiny smoke run first. Prefer explicit task filters once task names are selected. Until task names are selected, use `--n-tasks 1` only for setup validation.

Create an isolated, empty pi config root for the plain run:

```bash
export PI_PLAIN_CONFIG=/tmp/pi-terminal-bench-plain-config
rm -rf "$PI_PLAIN_CONFIG"
mkdir -p "$PI_PLAIN_CONFIG"
printf '{"enableInstallTelemetry":false}\n' > "$PI_PLAIN_CONFIG/settings.json"
```

Run plain pi with Harbor's built-in agent. This requires an API key or other non-interactive credential for the selected provider to be available in the host environment so Harbor can pass it to the agent:

```bash
harbor run \
  -d terminal-bench@2.0 \
  -a pi \
  -m anthropic/claude-sonnet-4-5 \
  --mounts-json "[{\"type\":\"bind\",\"source\":\"$PI_PLAIN_CONFIG\",\"target\":\"/tmp/pi-config\",\"bind\":{\"create_host_path\":false}}]" \
  --ae PI_CODING_AGENT_DIR=/tmp/pi-config \
  --jobs-dir ./tbench-results/plain-smoke \
  --n-tasks 1 \
  -n 1
```

For a fixed smoke subset, replace `--n-tasks 1` with explicit Harbor task filters, for example:

```bash
harbor run \
  -d terminal-bench@2.0 \
  -a pi \
  -m anthropic/claude-sonnet-4-5 \
  --include-task-name '<task-name-1>' \
  --include-task-name '<task-name-2>' \
  --mounts-json "[{\"type\":\"bind\",\"source\":\"$PI_PLAIN_CONFIG\",\"target\":\"/tmp/pi-config\",\"bind\":{\"create_host_path\":false}}]" \
  --ae PI_CODING_AGENT_DIR=/tmp/pi-config \
  --jobs-dir ./tbench-results/plain-smoke \
  -n 1
```

Record in benchmark notes:

- model/provider
- dataset version
- task names or filters
- environment type (`docker`, `daytona`, etc.)
- jobs directory
- Harbor version
- pi version reported in Harbor trial metadata or setup logs

## Full SuPi smoke run

The first SuPi path should use normal pi package loading through an isolated `PI_CODING_AGENT_DIR`, not a patched benchmark adapter.

Prefer a published package or pinned git package for reproducibility:

```bash
export PI_SUPI_CONFIG=/tmp/pi-terminal-bench-supi-config
rm -rf "$PI_SUPI_CONFIG"
mkdir -p "$PI_SUPI_CONFIG"
cat > "$PI_SUPI_CONFIG/settings.json" <<'JSON'
{
  "enableInstallTelemetry": false,
  "packages": ["npm:@mrclrchtr/supi"]
}
JSON
```

Run the same smoke task(s) with the same model and a separate jobs directory:

```bash
harbor run \
  -d terminal-bench@2.0 \
  -a pi \
  -m anthropic/claude-sonnet-4-5 \
  --mounts-json "[{\"type\":\"bind\",\"source\":\"$PI_SUPI_CONFIG\",\"target\":\"/tmp/pi-config\",\"bind\":{\"create_host_path\":false}}]" \
  --ae PI_CODING_AGENT_DIR=/tmp/pi-config \
  --jobs-dir ./tbench-results/supi-smoke \
  --n-tasks 1 \
  -n 1
```

For local development against this checkout, a mounted local path may work if pi can load the package and its runtime dependencies inside the Linux task container:

```json
{
  "enableInstallTelemetry": false,
  "packages": ["/mnt/supi"]
}
```

Then include both config and repository mounts:

```bash
--mounts-json "[
  {\"type\":\"bind\",\"source\":\"$PI_SUPI_CONFIG\",\"target\":\"/tmp/pi-config\",\"bind\":{\"create_host_path\":false}},
  {\"type\":\"bind\",\"source\":\"/Users/mrclrchtr/Development/mrclrchtr/supi-worktrees/supi-wt4\",\"target\":\"/mnt/supi\",\"read_only\":true,\"bind\":{\"create_host_path\":false}}
]"
```

Use the published npm or pinned git package for comparable runs unless local-path loading has been validated in the container. A host-side preflight with `PI_CODING_AGENT_DIR` and the local worktree path can prove the package itself is loadable, but it does not prove Harbor's task container loaded it; the benchmark run artifacts still need SuPi-specific markers.

## Verifying SuPi loading

Before running Terminal-Bench tasks, verify the local package can load in a Linux container with the same mount shape:

```bash
scripts/check-supi-container-load
```

The script mounts this checkout at `/mnt/supi-worktree`, mounts a writable `PI_CODING_AGENT_DIR` at `/tmp/pi-config`, installs pi in a short-lived `node:22-bookworm` container, enables `SUPI_LOG_STATUS=1`, and runs `/supi-debug` as a sentinel. A passing preflight prints a `customType: "supi-debug-report"` JSON event plus a `SUPI_STATUS {...}` line showing expected SuPi tools registered/active (`ask_user`, `lsp`, `tree_sitter`, `code_intel`, `supi_debug`). The status is recorded with pi's native non-LLM `appendEntry("supi-status", ...)` surface when sessions are enabled, and also written to stderr so Harbor's `2>&1 | tee pi.txt` captures it during `--no-session` runs. Do not use `pi.sendMessage()` for this marker; custom messages are converted into LLM-visible user messages even when `display: false`. This does not run Terminal-Bench and should not need an API key; if SuPi does not load, the slash command is not registered and pi falls through to a model call, which fails in the clean container.

Important local-container details:

- Run `pnpm install` after rebases or dependency changes so workspace `node_modules` links exist for all packages.
- Keep the pi config mount writable; pi takes a settings lock and read-only config mounts can make package loading fail.
- On local Podman/macOS, put the host config under a shared path such as `/Users/...`; host `/tmp` may not appear inside the Podman VM.

For actual A/B run artifacts, enable the status marker on SuPi runs only:

```bash
--ae SUPI_LOG_STATUS=1
```

Then verify SuPi loading before interpreting results:

- Inspect the SuPi variant's `agent/pi.txt` and parse the `SUPI_STATUS {...}` line.
- Confirm the marker reports expected tools registered and active: `ask_user`, `lsp`, `tree_sitter`, `code_intel`, and `supi_debug`.
- Confirm the marker reports expected commands such as `/supi-debug` and `/supi-settings`.
- Confirm the plain pi run does not contain `SUPI_STATUS` or SuPi-only resources.
- If SuPi loading cannot be proven from logs, treat the run as invalid for A/B comparison.

## Harbor logging, config, and artifact surfaces

Harbor's native result layout is sufficient for this comparison. Keep using these built-in surfaces rather than adding a benchmark harness.

Host-side job layout under the selected `--jobs-dir`:

```text
<jobs-dir>/<job-name>/
  config.json          # persisted JobConfig, with sensitive env values templated/redacted
  job.log              # Harbor job logger; DEBUG detail when --debug is set
  result.json          # final aggregate JobResult stats
  <trial-name>/
    config.json        # per-trial TrialConfig
    result.json        # per-trial TrialResult with timings, rewards, agent_result
    trial.log          # per-trial Harbor logger
    agent/pi.txt       # built-in pi agent JSON stream plus stderr because Harbor tees 2>&1
    verifier/test-stdout.txt
    verifier/reward.txt or verifier/reward.json
    artifacts/         # convention/config-driven artifacts, when present
```

Container-side conventional paths used by Harbor:

```text
/logs/agent
/logs/verifier
/logs/artifacts
/tests
/solution
/logs/verifier/reward.txt
/logs/verifier/reward.json
```

For Docker environments, `/logs/agent`, `/logs/verifier`, and `/logs/artifacts` are bind-mounted to the trial directory. Harbor fixes ownership before host reads on Linux. The built-in pi agent runs a command equivalent to:

```bash
pi --print --mode json --no-session ... 2>&1 </dev/null | stdbuf -oL tee /logs/agent/pi.txt
```

That `2>&1 | tee` is why opt-in SuPi stderr markers such as `SUPI_STATUS {...}` appear in `agent/pi.txt` without entering the LLM context.

Useful CLI/config hooks for the comparison:

- `--jobs-dir` and `--job-name` control reproducible output locations.
- `--debug` increases console logging and keeps DEBUG detail in `job.log`/`trial.log`.
- `--ak thinking=xhigh` fixes Harbor's exposed pi thinking flag.
- `--ae KEY=VALUE` passes environment to the installed agent; use this for `PI_CODING_AGENT_DIR=/tmp/pi-config` and optional `SUPI_LOG_STATUS=1`.
- `--mounts-json` mounts the isolated pi config root and, for local SuPi, the worktree path.
- `--artifact /container/path` collects additional in-container artifacts after a trial; task-level, job-level, and step-level artifact configs are merged and recorded in `artifacts/manifest.json` when downloaded.
- `--env-file` can load host environment values before Harbor resolves env templates.
- `--ve KEY=VALUE` passes verifier-only environment.
- Retry defaults exclude timeout/reward/parse failures (`AgentTimeoutError`, `VerifierTimeoutError`, `RewardFileNotFoundError`, `RewardFileEmptyError`, `VerifierOutputParseError`), so reward failures are not silently retried unless explicitly configured.

For Terminal-Bench tasks, Harbor's mapper appends reward logging to the copied `run-tests.sh`: exit code `0` writes `1` to `/logs/verifier/reward.txt`, otherwise `0`. It also maps Terminal-Bench timeouts into Harbor agent/verifier timeouts. Therefore pass/fail should be read from Harbor's native verifier rewards, not from custom parsing of task output.

## Native result metrics

Report only fields available from native Harbor artifacts. Expected useful fields include:

- reward/pass/fail from each trial's `verifier_result.rewards`
- exceptions/errors from `exception_info`
- timing/duration from `started_at`/`finished_at` and phase timing fields
- prompt/input tokens from `agent_result.n_input_tokens`
- completion/output tokens from `agent_result.n_output_tokens`
- cache tokens from `agent_result.n_cache_tokens`
- cost from `agent_result.cost_usd`

For Harbor's built-in pi agent, these token/cost fields are parsed from `agent/pi.txt` `message_end` events for assistant messages. Harbor sets `n_input_tokens` to input plus cache-read tokens, `n_cache_tokens` to cache-read tokens, `n_output_tokens` to output tokens, and `cost_usd` to the summed pi-reported total cost when present.

The final job-level `result.json` stores aggregate stats and may omit full trial payloads; use each `<trial-name>/result.json` for per-trial token/cost/timing details.

If the native result contains only pass/fail and timing data, report only those metrics. If token, cache, turn, or cost fields are present in Harbor's native artifacts, they may be reported without adding custom counters.

Suggested limitation language when token/cost fields are absent:

> This run reports only metrics available from native Harbor artifacts. Token, cost, turn, or tool-call metrics were not available from the initial artifacts, so this report does not make token/cost claims.

## Smoke acceptance gates

Proceed to a larger/full A/B run only when all are true:

- Oracle validation succeeds.
- Plain pi runs at least one selected task end-to-end.
- Full SuPi runs the same selected task end-to-end.
- SuPi loading is visible in logs for the SuPi variant.
- Plain pi and full SuPi outputs are in separate jobs directories.
- Native artifacts are available and understood.
- Any missing desired metrics are documented as limitations.

If any gate fails, stop and fix the setup/methodology before running more tasks.

## Observed local smoke notes

A local AppleHV/Rosetta smoke on `llm-inference-batching-scheduler` used `openrouter/deepseek/deepseek-v4-flash` through Harbor's built-in `pi` agent. With pi's default `medium` thinking level, plain pi passed and the SuPi-configured variant narrowly failed one verifier threshold. With `--ak thinking=xhigh`, both variants passed:

| Variant | Thinking | Reward | Duration | Input/cache tokens | Output tokens | Cost |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| oracle | n/a | 1.0 | 29.1s | n/a | n/a | n/a |
| plain pi | medium | 1.0 | 1010.4s | 1,755,639 / 1,730,048 | 64,431 | $0.02647 |
| SuPi-configured | medium | 0.0 | 1112.7s | 2,055,114 / 2,021,504 | 72,068 | $0.03054 |
| plain pi | xhigh | 1.0 | 1090.2s | 1,061,364 / 1,009,024 | 34,899 | $0.01992 |
| SuPi-configured | xhigh | 1.0 | 1121.2s | 4,235,414 / 4,184,064 | 77,241 | $0.04053 |
| SuPi local-path configured | xhigh | 0.0 | 1533.7s | 6,119,179 / 6,055,552 | 111,214 | $0.05700 |
| SuPi local-path verified | xhigh | 1.0 | 842.1s | 4,125,738 / 4,033,408 | 65,760 | $0.04263 |

Relevant local result directories:

```text
/Users/mrclrchtr/Development/public/tbench-results/plain-smoke-openrouter-xhigh/2026-04-28__20-15-56
/Users/mrclrchtr/Development/public/tbench-results/supi-smoke-openrouter-xhigh/2026-04-28__19-57-04
/Users/mrclrchtr/Development/public/tbench-results/supi-local-smoke-openrouter-xhigh/2026-04-29__00-29-56
/Users/mrclrchtr/Development/public/tbench-results/supi-local-verified-smoke-openrouter-xhigh/2026-04-29__01-25-04
```

Treat these as smoke results, not benchmark claims. The first local-path run mounted this checkout at `/mnt/supi-worktree` and configured `packages: ["/mnt/supi-worktree"]`; it failed verifier shape feasibility for bucket 2 (`seq_align` 320 for a request requiring 384). After `pnpm install` restored workspace links and `scripts/check-supi-container-load` passed with the `supi-debug-report` sentinel, the verified local-path run passed. The benchmark trajectory itself still did not show SuPi-specific markers such as `code-intelligence-overview`, `tree_sitter`, `code_intel`, `lsp`, or `ask_user` because the task did not call SuPi-only resources; use the separate container-load preflight as the local package loading proof, and keep the thinking level fixed across variants.

## Larger run shape

After smoke gates pass, run a larger comparison with the same controls:

- same model/provider
- same Terminal-Bench dataset version
- same task IDs/names
- same environment type
- same concurrency policy
- separate jobs directories
- same Harbor version
- same pi version
- pinned SuPi package source for the SuPi variant

Example directory convention outside this repository:

```text
tbench-results/
  oracle-smoke/
  plain-smoke/
  supi-smoke/
  plain-full/
  supi-full/
```

Do not commit generated jobs, logs, or result directories to this repository.

## When to revisit `pi-terminal-bench`

Do not modify `pi-terminal-bench` for the initial workflow. Revisit it only if Harbor's built-in `pi` agent cannot support the needed package/config isolation through `PI_CODING_AGENT_DIR`, `--agent-env`, and Docker mounts.
