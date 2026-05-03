## Purpose

Implement the supi-rtk extension that transparently rewrites bash commands through the RTK CLI, saving context window tokens by automatically filtering and compacting command output. The extension integrates with pi's bash tool via spawnHook for automatic command rewriting and with the user_bash event for context-visible `!cmd` user commands. It tracks rewrite statistics and exposes them through supi-core's context-provider registry.

## ADDED Requirements

### Requirement: RTK binary verification
The extension SHALL verify that `rtk` is available on PATH during extension load. If `rtk` is not found, the extension SHALL throw an error that prevents loading.

#### Scenario: rtk binary found
- **WHEN** the extension loads and `rtk` is available on PATH
- **THEN** the extension registers the replacement bash tool and user_bash hook

#### Scenario: rtk binary missing
- **WHEN** the extension loads and `rtk` is not available on PATH
- **THEN** the extension throws an error with a message indicating rtk must be installed

### Requirement: Bash command rewriting via spawnHook
The extension SHALL register a replacement bash tool using `createBashTool()` with a `spawnHook` that rewrites commands through `rtk rewrite`. The rewrite SHALL be transparent — the model sees normal bash tool behavior.

#### Scenario: Rewritable command
- **WHEN** the agent calls the bash tool with a command that `rtk rewrite` supports (exit 0)
- **THEN** the spawnHook replaces the command with the rewritten version before execution

#### Scenario: Non-rewritable command
- **WHEN** the agent calls the bash tool with a command that `rtk rewrite` does not support (exit non-0)
- **THEN** the spawnHook passes the original command unchanged

#### Scenario: rtk rewrite timeout
- **WHEN** `rtk rewrite` takes longer than the configured timeout
- **THEN** the spawnHook passes the original command unchanged

#### Scenario: Compound command rewriting
- **WHEN** the agent calls bash with `git status && git diff`
- **THEN** `rtk rewrite` rewrites both parts: `rtk git status && rtk git diff`

#### Scenario: Pipe command rewriting
- **WHEN** the agent calls bash with `cat foo.json | jq '.bar'`
- **THEN** `rtk rewrite` rewrites only the rewritable side: `rtk read foo.json | jq '.bar'`

#### Scenario: Already rewritten command
- **WHEN** the agent calls bash with a command already prefixed with `rtk`
- **THEN** `rtk rewrite` returns the command unchanged (idempotent)

### Requirement: User bash hook
The extension SHALL hook the `user_bash` event to rewrite context-visible `!cmd` user shell commands through `rtk rewrite`. Commands entered with `!!cmd` (context-excluded) SHALL NOT be intercepted.

#### Scenario: User runs !cmd
- **WHEN** user enters `!git status` (context-visible)
- **THEN** the extension rewrites the command through `rtk rewrite` and returns custom bash operations

#### Scenario: User runs !!cmd
- **WHEN** user enters `!!git status` (context-excluded, `event.excludeFromContext` is true)
- **THEN** the extension does not intercept the command

#### Scenario: User !cmd not rewritable
- **WHEN** user enters `!echo hello` and `rtk rewrite` returns non-0
- **THEN** the extension falls through to normal pi user_bash handling

### Requirement: Rewrite timeout configuration
The rewrite timeout SHALL be configurable via supi-core config with a default of 5000ms.

#### Scenario: Default timeout
- **WHEN** no timeout is configured
- **THEN** `rtk rewrite` calls use a 5000ms timeout

#### Scenario: Custom timeout
- **WHEN** the user sets `rewriteTimeout` to 3000 in supi config
- **THEN** `rtk rewrite` calls use a 3000ms timeout

### Requirement: Per-session savings tracking
The extension SHALL track rewrite statistics per session: number of rewrites, number of fallbacks, and estimated token savings. Statistics SHALL reset on `session_start`.

#### Scenario: Successful rewrite tracked
- **WHEN** a bash command is successfully rewritten
- **THEN** the rewrite count increments and the command is recorded

#### Scenario: Session reset
- **WHEN** a `session_start` event fires
- **THEN** all tracking statistics reset to zero

#### Scenario: Savings data accessible
- **WHEN** another extension queries the context-provider registry for "rtk" data
- **THEN** current session statistics (rewrite count, fallback count) are returned

### Requirement: Supi-core config integration
The extension SHALL register settings with the supi-core config system: `enabled` (on/off, default on) and `rewriteTimeout` (ms, default 5000).

#### Scenario: Extension disabled via settings
- **WHEN** the user sets `enabled` to `off` in supi config for the rtk section
- **THEN** the spawnHook passes commands unchanged and user_bash hook falls through

#### Scenario: Settings visible in /supi-settings
- **WHEN** the user opens `/supi-settings`
- **THEN** the rtk settings section appears with `enabled` and `rewriteTimeout` options

### Requirement: Meta-package integration
The extension SHALL be wired into the `supi` meta-package via `packages/supi/rtk.ts` and into the root `package.json` extensions list.

#### Scenario: Extension loads via meta-package
- **WHEN** a user installs `@mrclrchtr/supi`
- **THEN** the supi-rtk extension is available (if rtk binary is installed)

#### Scenario: Extension loads via workspace root
- **WHEN** a developer runs pi from the workspace root
- **THEN** the supi-rtk extension is listed in root `package.json` `pi.extensions`

### Requirement: RTK debug event emission
The RTK extension SHALL record debug events through the shared debug registry for rewrite outcomes that are useful for diagnosing token-savings behavior. Recording debug events SHALL NOT change command execution behavior: successful rewrites SHALL still execute rewritten commands, and fallbacks SHALL still execute original commands.

#### Scenario: Rewrite fallback recorded
- **WHEN** an RTK rewrite attempt falls back to the original command because `rtk rewrite` fails, times out, returns empty output, or the `rtk` binary is unavailable
- **THEN** the extension records a debug event with source `rtk`, category `fallback`, the fallback reason, cwd, duration, timeout configuration, and sanitized command data
- **AND** the original command is still passed through unchanged

#### Scenario: Successful rewrite recorded
- **WHEN** an RTK rewrite attempt changes the command that will be executed
- **THEN** the extension records a debug event with source `rtk`, category `rewrite`, cwd, duration, sanitized original command, and sanitized rewritten command
- **AND** the rewritten command is still executed

#### Scenario: Unchanged rewrite recorded as debug detail
- **WHEN** `rtk rewrite` succeeds but returns the original command unchanged
- **THEN** the extension records a debug event with source `rtk`, category `unchanged`, cwd, duration, and sanitized command data
- **AND** the original command is still executed

#### Scenario: Debug registry disabled
- **WHEN** RTK attempts a rewrite while the shared debug registry is disabled
- **THEN** no RTK debug event is retained
- **AND** normal RTK rewrite, fallback, and statistics behavior is unchanged

### Requirement: RTK fallback reason classification
The RTK rewrite helper SHALL expose enough structured result information for the extension to classify fallback reasons.

#### Scenario: Timeout classified
- **WHEN** `rtk rewrite` exceeds the configured timeout
- **THEN** the RTK debug event reason is `timeout`

#### Scenario: Missing binary classified
- **WHEN** the RTK availability probe or rewrite call fails because the `rtk` binary is unavailable
- **THEN** the RTK debug event reason is `unavailable`

#### Scenario: Non-zero exit with no usable stdout classified
- **WHEN** `rtk rewrite` exits non-zero and produces no usable stdout
- **THEN** the RTK debug event reason is `non-zero-exit`

#### Scenario: Empty rewrite output classified
- **WHEN** `rtk rewrite` exits successfully but returns empty output
- **THEN** the RTK debug event reason is `empty-output`

#### Scenario: Non-zero exit with usable stdout remains successful
- **WHEN** `rtk rewrite` exits non-zero but emits a usable rewrite on stdout
- **THEN** the extension treats the rewrite as successful
- **AND** it does not record a fallback debug event for that command
