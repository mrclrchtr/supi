## ADDED Requirements

### Requirement: Manual package audit commands
The extension SHALL register manual audit commands through `pi.registerCommand()`.

The documented command surface for v1 is:

```text
/supi-security-audit <source>
/supi-security-audit-pending
```

#### Scenario: Single-package audit command is available
- **WHEN** the user types `/supi-security-audit npm:@foo/bar`
- **THEN** the command handler executes and begins the audit pipeline for the matching effective installed npm package

#### Scenario: Audit-pending command is available
- **WHEN** the user types `/supi-security-audit-pending`
- **THEN** the command handler executes and begins auditing effective installed npm packages whose current audit state requires user attention

#### Scenario: Source argument is missing
- **WHEN** the user runs `/supi-security-audit` with no source argument
- **THEN** the command SHALL abort without scanning
- **AND** it SHALL print a usage message showing `/supi-security-audit <source>`

#### Scenario: No packages need audit
- **WHEN** the user runs `/supi-security-audit-pending` and no effective installed npm packages are new, changed, stale, or pending audit
- **THEN** the command SHALL exit without scanning additional packages
- **AND** it SHALL show a clear message explaining that nothing currently requires audit

### Requirement: npm-only effective package audit support
The audit commands SHALL support only effective installed npm packages in v1.

#### Scenario: npm package source is accepted
- **WHEN** the requested audit target resolves to an effective installed npm package
- **THEN** the command SHALL treat it as a supported audit target

#### Scenario: Unknown package is rejected
- **WHEN** the requested source or package name does not match any effective installed npm package
- **THEN** the command SHALL abort before scanning
- **AND** it SHALL show a clear error explaining that no matching effective installed npm package was found

#### Scenario: Non-npm effective package is rejected
- **WHEN** the requested audit target resolves to a git or local effective package source
- **THEN** the command SHALL abort before scanning
- **AND** it SHALL show a clear error explaining that only npm packages are supported in v1

### Requirement: Shared pi API integration for audit targeting
The audit commands SHALL use pi's public package-management APIs by constructing a shared `SettingsManager` and `DefaultPackageManager` with `getAgentDir()`, and by deriving effective package targets from `resolve()`.

#### Scenario: Effective package resolution uses `resolve()`
- **WHEN** an audit command needs to determine which package to scan
- **THEN** it SHALL call `new DefaultPackageManager({ cwd, agentDir: getAgentDir(), settingsManager })`
- **AND** it SHALL invoke `resolve()` to determine the effective runtime package set

#### Scenario: Installed path is recovered from package manager
- **WHEN** an audit command identifies an effective installed npm package target
- **THEN** it SHALL call `getInstalledPath(source, scope)` for that package group
- **AND** it SHALL use the installed package root for scanning and version detection

#### Scenario: Temporary package scope is skipped
- **WHEN** an effective npm package group has `scope === "temporary"`
- **THEN** the audit pipeline SHALL skip that package group in v1
- **AND** it SHALL NOT call `getInstalledPath()` for that temporary scope entry

#### Scenario: `npq` is invoked directly
- **WHEN** the audit pipeline needs to run `npq <name>@<version> --plain`
- **THEN** it SHALL resolve and invoke `npq` directly from `PATH`
- **AND** it SHALL NOT prepend pi's configured `npmCommand` wrapper to the `npq` invocation

### Requirement: npq health scan for the installed version
For npm audit targets, the scanner SHALL determine the exact installed package version from the installed package root, shell out to `npq <name>@<version> --plain`, and capture per-package errors, warnings, and summary totals.

#### Scenario: Installed version is used
- **WHEN** the audit target is `npm:@foo/bar`
- **THEN** the scanner SHALL determine the exact installed version before running `npq`
- **AND** it SHALL audit that exact installed version rather than a floating npm tag

#### Scenario: npq detects warnings
- **WHEN** `npq` returns warnings for the installed package version
- **THEN** the scanner SHALL record each warning with its category and message

#### Scenario: npq detects errors
- **WHEN** `npq` returns errors for the installed package version
- **THEN** the scanner SHALL record each error with its category and message

#### Scenario: npq summary totals are parsed
- **WHEN** `npq` prints the summary section
- **THEN** the scanner SHALL record the total package, error, and warning counts from that output

#### Scenario: npq is not installed
- **WHEN** the `npq` executable is not found in `PATH`
- **THEN** the scanner SHALL show a clear hint with install instructions
- **AND** it SHALL skip the `npq` scan while continuing the pi capability scan

#### Scenario: npq output cannot be parsed
- **WHEN** `npq --plain` returns output that does not match the expected parser rules
- **THEN** the scanner SHALL mark the npm-health section as unparsed
- **AND** it SHALL include raw `npq` stdout in the report instead of silently omitting npm-health results

### Requirement: Installed package capability scan
The scanner SHALL perform a full installed-package audit by discovering and scanning package resources for known pi API patterns and instruction-level risk signals, and by reporting findings split into code capabilities and instruction-level risks.

If the effective installed package has discovered resources that are not currently active at runtime, the report SHALL distinguish:
- findings from currently enabled effective runtime resources
- findings from inactive or not-currently-enabled package resources

Inactive resources SHALL remain visible in the report rather than being silently omitted.

Resource discovery SHALL follow pi's package rules in order:
1. Read the `pi` key in the installed package's `package.json`.
2. If a `pi` manifest is present, resolve `extensions`, `skills`, `prompts`, and `themes` paths, globs, and exclusions from that manifest, including paths into bundled dependencies such as `node_modules/other-pkg/extensions`.
3. If no `pi` manifest is present, fall back to conventional directories: `extensions/` (`.ts`, `.js`), `skills/` (`SKILL.md` and root `.md` files), `prompts/` (`.md` files), and `themes/` (`.json` files).
4. Apply effective runtime filter semantics for the active bucket, including `!`, `+path`, `-path`, and resource enable or disable state, without omitting inactive resources from the audit.

#### Scenario: Detect tool interception in extensions
- **WHEN** an extension source file contains `pi.on("tool_call"`
- **THEN** the scanner SHALL report `Intercepts tool calls` under code capabilities

#### Scenario: Detect tool result modification in extensions
- **WHEN** an extension source file contains `pi.on("tool_result"`
- **THEN** the scanner SHALL report `Modifies tool results` under code capabilities

#### Scenario: Detect bash override in extensions
- **WHEN** an extension source file contains `createBashTool(`
- **THEN** the scanner SHALL report `Overrides bash tool` under code capabilities

#### Scenario: Detect read/write/edit override in extensions
- **WHEN** an extension source file contains `createReadTool(`, `createWriteTool(`, or `createEditTool(`
- **THEN** the scanner SHALL report the specific override(s) under code capabilities

#### Scenario: Detect custom tools in extensions
- **WHEN** an extension source file contains `pi.registerTool(`
- **THEN** the scanner SHALL report the count of custom tools registered under code capabilities

#### Scenario: Detect custom commands in extensions
- **WHEN** an extension source file contains `pi.registerCommand(`
- **THEN** the scanner SHALL report the count of custom commands registered under code capabilities

#### Scenario: Detect network access in extensions
- **WHEN** an extension source file contains `import.*node:http`, `import.*node:https`, `import.*node:net`, or `fetch(`
- **THEN** the scanner SHALL report `Network access detected` under code capabilities

#### Scenario: Detect subprocess execution in extensions
- **WHEN** an extension source file contains `import.*node:child_process`, `spawn(`, or `exec(`
- **THEN** the scanner SHALL report `Subprocess execution detected` under code capabilities

#### Scenario: Detect filesystem access in extensions
- **WHEN** an extension source file contains `import.*node:fs` or `readFileSync(`
- **THEN** the scanner SHALL report `Filesystem access detected` under code capabilities

#### Scenario: Detect environment access in extensions
- **WHEN** an extension source file contains `process\\.env`
- **THEN** the scanner SHALL report `Environment variable access detected` under code capabilities

#### Scenario: Detect executable instructions in skills
- **WHEN** a discovered skill markdown file contains patterns like `bash`, `npm install`, `curl | bash`, or executable code blocks
- **THEN** the scanner SHALL report `Skill contains executable instructions` under instruction-level risks

#### Scenario: Detect system prompt injection in prompts
- **WHEN** a discovered prompt template contains instructions that override safety guidelines or request credential access
- **THEN** the scanner SHALL report `Prompt may contain override instructions` under instruction-level risks

#### Scenario: Manifest-declared resources are discovered
- **WHEN** a package's `package.json` contains `"pi": { "extensions": ["./custom-exts"] }`
- **THEN** the scanner SHALL discover resources from `./custom-exts/`
- **AND** it SHALL NOT rely solely on conventional `extensions/` directory discovery

#### Scenario: Bundled dependency paths are resolved and scanned
- **WHEN** a package's `pi` manifest includes `"node_modules/other-pkg/extensions"`
- **THEN** the scanner SHALL resolve that bundled dependency path from the installed package contents
- **AND** it SHALL scan the discovered extension files with the same capability rules used for first-party package extensions

#### Scenario: Exact-path filter include is honored for active findings
- **WHEN** the effective package filter contains `"+extensions/safe.ts"`
- **THEN** the scanner SHALL include `extensions/safe.ts` in the active runtime bucket when computing active findings
- **AND** it SHALL still report other discovered resources outside the active bucket as inactive when applicable

#### Scenario: Exact-path filter exclude is honored for active findings
- **WHEN** the effective package filter contains `"-extensions/legacy.ts"`
- **THEN** the scanner SHALL exclude `extensions/legacy.ts` from the active runtime bucket
- **AND** it SHALL still scan `extensions/legacy.ts` for audit visibility and report any findings as inactive

#### Scenario: Package with only skills does not appear fully clean
- **WHEN** a package has no discovered extension files but has discovered skill files with executable instructions
- **THEN** the scanner SHALL still report findings under instruction-level risks
- **AND** it SHALL NOT report a clean overall result

### Requirement: Cross-reference risk escalation
The scanner SHALL apply concrete cross-reference rules to elevate severity when combinations of capabilities imply materially higher risk.

Regex-derived findings are heuristic. The report SHALL present them as pattern matches or possible capabilities unless a stronger signal is available.

#### Scenario: Network plus filesystem escalates severity
- **WHEN** the scanner finds both network access and filesystem access in scanned package resources
- **THEN** it SHALL add a high-risk finding explaining that the package can exfiltrate local files

#### Scenario: Network plus environment access escalates severity
- **WHEN** the scanner finds both network access and environment-variable access
- **THEN** it SHALL add a high-risk finding explaining that the package can exfiltrate secrets or tokens

#### Scenario: Network plus subprocess execution escalates severity
- **WHEN** the scanner finds both network access and subprocess execution
- **THEN** it SHALL add a high-risk finding explaining that the package can download and execute remote code

#### Scenario: Tool interception plus tool modification escalates severity
- **WHEN** the scanner finds tool interception or tool-result modification together with custom tool registration or built-in tool override
- **THEN** it SHALL add a high-risk finding explaining that the package can reshape agent behavior dynamically

#### Scenario: Prompt override instructions are high risk on their own
- **WHEN** the scanner finds prompt instructions that override safety boundaries or request credential access
- **THEN** it SHALL add a high-risk finding even without any additional cross-reference combination

### Requirement: Report presentation and audit acknowledgment
The scanner SHALL present findings in a rich TUI overlay when `ctx.ui.custom()` is available, or use plain-text fallback otherwise.

When inactive or not-currently-enabled resources produce findings, the report SHALL show them separately from currently enabled effective runtime findings.

Audit status for the currently installed package version SHALL be updated to `acknowledged` only after explicit user acknowledgment in interactive mode.
The report may classify findings as `info`, `warning`, or `error`.

#### Scenario: Rich TUI available
- **WHEN** `ctx.ui.custom()` is defined and returns a promise
- **THEN** the scanner SHALL render a full-screen overlay with categorized findings and an explicit action to acknowledge the package audit

#### Scenario: Inactive findings are shown separately
- **WHEN** the audit finds issues in resources that are discovered but not currently enabled
- **THEN** the report SHALL place those issues in a distinct inactive or not-currently-enabled section
- **AND** it SHALL NOT merge them into the currently enabled effective runtime summary

#### Scenario: Interactive plain-text fallback
- **WHEN** `ctx.ui.custom()` is unavailable but interactive UI is still available
- **THEN** the scanner SHALL print plain-text findings and prompt with `ctx.ui.confirm()` before acknowledging the package audit

#### Scenario: Headless mode prints report only
- **WHEN** `ctx.hasUI === false`
- **THEN** the scanner SHALL print the report in plain text
- **AND** it SHALL NOT attempt to call interactive dialog methods
- **AND** it SHALL NOT acknowledge the package audit automatically
