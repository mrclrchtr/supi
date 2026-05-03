## 1. External Tooling Reconnaissance

- [x] 1.1 Inspect Harbor's built-in `pi` agent and the optional `badlogic/pi-terminal-bench` adapter for context.
- [x] 1.2 Identify how Harbor's built-in `pi` agent launches pi and how plain pi vs full SuPi can be selected with isolated config roots.
- [x] 1.3 Identify which native result fields Harbor/Terminal-Bench/pi emit without custom instrumentation.

## 2. Methodology Documentation

- [x] 2.1 Add repository documentation for Harbor's built-in `pi` workflow, including Harbor version, Terminal-Bench dataset version, and optional reference adapter details.
- [x] 2.2 Document oracle validation, Harbor `upload_dir` fix verification, and smoke-run acceptance gates.
- [x] 2.3 Document plain pi and full SuPi smoke commands using the same task IDs, model/provider, environment type, isolated pi config roots, and separate jobs directories.
- [x] 2.4 Document how to verify that full SuPi loaded during the SuPi variant run.
- [x] 2.5 Document how to interpret native result artifacts and how to state limitations when token/cost/turn metrics are absent.

## 3. Minimal Helpers If Needed

- [x] 3.1 Add only minimal wrapper scripts if documentation-only commands are too error-prone, keeping Harbor and any optional adapters external.
- [x] 3.2 Add only minimal native-result summarization if Harbor's existing output display is insufficient, and ensure it handles missing token/cost fields without failing.
- [x] 3.3 Ensure any generated benchmark outputs or local external checkout paths are documented as untracked/ignored local artifacts.

## 4. Verification

- [x] 4.1 Run formatting/lint checks for changed documentation or scripts.
- [x] 4.2 Verify the OpenSpec change with the relevant OpenSpec validation command.
- [x] 4.3 Review the final workflow against the spec to confirm it does not vendor Harbor or adapters, add custom benchmark tasks, define custom scoring, or require custom token instrumentation.
