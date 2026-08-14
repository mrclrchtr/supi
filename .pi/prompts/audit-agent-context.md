---
description: Audit all SuPi agent-context surfaces and propose a low-steering package catalog
argument-hint: "[report path]"
---
# Audit SuPi agent context

Write the audit to `${1:-docs/agent-context-audit.md}`. Limit repository changes to that report.

## Goal

Define a SuPi package catalog that gives agents powerful, optional capabilities while PI stays as close as possible to its standard behavior.

Inspect every immediate package directory under `packages/`. Find agent-facing context that is:

- not useful
- duplicated
- too verbose for its decision point
- likely to direct the agent to the wrong action or tool
- stricter than its safety, correctness, or protocol need

Do not assume that context is useful because it already has tests or an ADR. Treat tests and ADRs as evidence of intent, then assess the current behavior against the goal.

## Establish the baseline

1. Read the repository instructions, root `CONTEXT.md`, `CONTEXT-MAP.md`, and the context file for each package.
2. Read the relevant installed PI documentation before you make PI-specific claims. Start with PI's `docs/index.md`. Read the relevant sections of `docs/extensions.md`, especially the system-prompt build, event lifecycle, tool registration, tool results, `sendMessage()`, and `appendEntry()`.
3. Read the repository guidance that defines prompt-surface intent, including:
   - `docs/pi/tool-guidance.md`
   - `docs/tool-architecture.md`
   - `docs/adr/0005-code-tool-prompt-surface-division-of-labor.md`
   - `docs/adr/0012-runtime-scoped-prompt-surfaces-and-settings.md`
   - `docs/adr/0013-centralized-code-intelligence-prompt-steering-assumes-all-tools-active.md`
4. State the standard PI baseline. Separate PI-owned context from text that SuPi adds, replaces, or causes PI to expose.
5. Derive the package list from the filesystem. Include empty, private, resource-only, infrastructure, and extension packages. Do not use `CONTEXT-MAP.md` as the package inventory.

## Build a complete context-surface inventory

Trace runtime paths. Do not use text search as proof that the inventory is complete. Use source, package manifests, registration code, tests, and configuration together.

For each package, inspect these possible surfaces:

- tool names, descriptions, parameter descriptions, `promptSnippet`, and `promptGuidelines`
- system-prompt replacement or addition, including `before_agent_start`
- provider-message changes through `context` or provider-request hooks
- `tool_result` handlers and instructions added to tool output
- normal tool result text, errors, warnings, truncation text, follow-up hints, and next-action advice
- `pi.sendMessage()` content, hidden custom messages, queued follow-up turns, and automatic turns
- skills, profile files, child-agent system prompts, planner or reviewer prompts, recovery prompts, and continuation advice
- resource discovery that makes model-facing text available
- prompt-surface configuration and dynamic prompt builders
- bundled or forwarded extensions that can register the same context more than once
- root extension loading that changes the combined installed surface

Separate these audiences and lifetimes:

1. ambient parent-session context
2. per-turn parent-session context
3. context added only after a relevant tool call
4. child-agent-only context
5. on-demand skill or prompt content
6. human-only TUI or persisted data that does not enter model context

Do not report display-only rendering, notifications, or `appendEntry()` data as model context. If a surface is dynamic, trace the conditions that activate it and show a representative output.

For fixed text, record its character count. For dynamic text, record a measured representative size and the factors that can increase it. Mark text that is repeated on each turn or on each tool call.

## Assessment tests

Assess each surface with these tests.

### Utility

- What agent decision does this text improve?
- Is the text necessary to discover the capability, select it over a sibling, call it correctly, interpret its result, or preserve safety?
- Does standard PI behavior, the schema, the current tool result, or another package already supply the same information?
- Is the text available at the time when the agent needs it?

### Duplication

Name both sources of duplicated meaning. Check duplication between:

- tool description, snippet, guideline, and parameter schema
- system prompt and tool result
- two tools in one family
- two packages
- parent and child prompts
- source text, generated text, tests, and configurable defaults

Tests that assert runtime text are not a second context injection. Use them to locate the runtime source of truth.

### Verbosity

Keep only the information needed at that decision point. Look for:

- implementation details in the ambient system prompt
- capability caveats that can appear in a relevant result
- long ordered lists already expressed by a schema
- repeated provenance, truncation, or failure language
- prose that does not change likely agent behavior

### Direction

Flag text that can make the agent:

- select a SuPi tool when a standard PI tool is more direct
- inspect broadly before a narrow task
- call extra tools without an evidence need
- treat observations as proof
- trust stale, partial, or unsupported results
- edit, verify, ask, or continue when the user did not request that action
- follow package policy over a direct user instruction

### Strictness

For each absolute instruction, identify the invariant that requires it. Classify it as:

- required for safety or data integrity
- required by a tool protocol
- a user-selected workflow policy
- an unnecessary package preference

Prefer capability contracts and accurate results over ambient workflow control. Keep required guardrails. Scope workflow policy to explicit user actions or explicit settings.

### Context efficiency

Assess:

- cost when the package is installed but unused
- repetition frequency
- whether the text can move from ambient context to an on-demand result or skill
- whether tool activation already provides a correct scope boundary
- whether a human-only feature can stay out of model context
- whether an optional package boundary is better than a global instruction

## Package-level verdicts

Give each package one primary verdict:

- **No model context** — the package does not add model-facing context.
- **Keep** — the surface is useful, concise, correctly scoped, and not duplicated.
- **Compress** — keep the surface but reduce its text.
- **Move on demand** — preserve the information in a tool result, skill, command, or other later surface.
- **Relax policy** — preserve the capability but remove or scope workflow control.
- **Split or opt in** — keep policy-heavy behavior outside the standard package set.
- **Remove** — the surface has no useful behavioral effect or sends the agent in the wrong direction.

A package can have secondary actions, but select one primary verdict for the catalog.

## Report

Use this structure in `${1:-docs/agent-context-audit.md}`:

1. **Executive summary**
   - the largest ambient context costs
   - the most important wrong-direction or over-strict behavior
   - the proposed standard SuPi principle in one short paragraph

2. **Baseline and method**
   - standard PI baseline
   - inspected surfaces
   - package count
   - measurement method and limits

3. **Complete package catalog**
   - one row for every immediate directory under `packages/`
   - package role and install surface
   - agent-facing capability
   - context audience and activation point
   - measured context size
   - primary verdict
   - concise reason

4. **Cross-package context map**
   - show which package adds each ambient system-prompt line, tool family, automatic message, and follow-up policy
   - show duplicate or conflicting instructions as links between exact sources

5. **Findings**
   - order by expected behavioral impact, then by repeated context cost
   - give each finding a stable ID and High, Medium, or Low priority
   - include package, exact file and line, activation condition, audience, frequency, current text or representative output, measured size, violated test, behavioral risk, and evidence
   - for each duplicate, cite every duplicate source
   - for each strict rule, name the required invariant or state that none was found

6. **Proposed catalog design**
   - define which packages are standard capability packages, explicit workflow packages, human-only packages, on-demand resources, and infrastructure
   - define a small model-facing contract for each category
   - state which current capabilities remain available after the change
   - identify intentional behavior changes and user-control changes
   - recommend package-boundary changes only when prompt scoping cannot solve the problem

7. **Prioritized change plan**
   - for each flagged fixed prompt surface, give exact replacement text or an explicit deletion
   - for dynamic output, give the new assembly rule and one concise example
   - estimate the ambient and repeated context reduction with measured character counts
   - list focused tests that prove capability preservation, correct activation, and absence from unrelated turns
   - separate low-risk text changes from behavior or package-boundary changes

8. **Inventory appendix**
   - list every traced model-facing surface, including surfaces with a Keep verdict
   - list human-only surfaces that you checked and excluded
   - list uncertain surfaces and the missing evidence

## Evidence rules

- Cite exact repository paths and line numbers for all findings.
- Quote exact current text when it is fixed and reasonably short.
- Label inference. Do not present inferred runtime behavior as observed fact.
- Confirm whether a message enters model context. TUI visibility alone is not proof.
- Confirm whether a surface is active in the root stack, a standalone install, a child session, or only a test fixture.
- Do not recommend less truthful tool descriptions only to reduce size.
- Do not remove safety, data-integrity, trust, cancellation, truncation, or capability-limit information. Put it at the narrowest effective scope.
- Preserve user instructions as the highest workflow authority.

## Completion criteria

The audit is complete only when:

- every immediate `packages/*` directory appears exactly once in the package catalog
- every registered or forwarded extension has been traced from its manifest or loader to its model-facing surfaces
- every package has an evidence-based verdict, including packages with no model context
- every claimed duplicate names all known sources
- every removal, move, relaxation, or split states how the capability remains available or states the intentional capability loss
- every proposed replacement is concrete enough to implement and test
- the report distinguishes ambient parent context from tool-result, child-agent, on-demand, and human-only content
