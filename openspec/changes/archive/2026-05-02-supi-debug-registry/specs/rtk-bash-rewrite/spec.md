## ADDED Requirements

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
