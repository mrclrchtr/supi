# Claude marketplace support plan for pi

## Summary

Build Claude marketplace support as a **pi package / extension stack first**, not as a fork of pi.

This should cover the parts that map well onto pi's existing extension APIs:

- plugin discovery and enablement
- skills / commands import
- plugin agents via a subagent runtime
- command hooks compatibility
- optional `bin/` / `PATH` integration
- optional MCP evaluation later

### Current recommendation

- **Do not fork pi initially.**
- **Do not build an LSP bridge.** Pi already has first-class LSP support in this repository, so plugin-provided `.lsp.json` support is explicitly out of scope.
- Reassess a fork only after the extension approach hits a real API or UX ceiling.

## Goals

1. Install and load Claude marketplace plugins with as much useful compatibility as possible.
2. Support plugin features that map cleanly to pi:
   - `skills/`
   - `commands/`
   - `agents/`
   - `hooks/hooks.json`
   - `bin/`
3. Preserve Claude plugin enablement and scope semantics where practical:
   - user scope
   - project scope
   - local scope, if present in source metadata
4. Keep the implementation shippable as a normal pi package.

## Non-goals

- Forking pi core in v1
- Bridging Claude plugin LSP config
- Full byte-for-byte Claude Code UX parity
- Building a native pi core `/plugin` manager before validating the runtime approach
- Full MCP parity in the first iteration

## Why extension/package first

Pi's extension system already supports the core building blocks needed here:

- `resources_discover` can add skills and prompt paths dynamically.
- Extensions can register tools and commands.
- Extensions can intercept tool calls and lifecycle events.
- Extensions can spawn subprocesses and implement subagents.
- Pi packages can be installed from npm or git and loaded without forking core.

This aligns with pi's documented philosophy: advanced workflows like subagents and similar higher-level behavior are intended to live in extensions/packages rather than in the core runtime.

## Proposed architecture

Suggested module layout for a new package in this repo:

```text
claude-marketplace/
├── index.ts                # extension entry point
├── registry.ts             # plugin discovery, parsing, enablement, scopes
├── resources.ts            # skills/commands import + namespacing/materialization
├── agents.ts               # Claude agent parsing + runtime registry
├── hooks.ts                # hook loading and pi event adaptation
├── bash-path.ts            # PATH/bin integration for enabled plugins
├── mcp.ts                  # optional future bridge, not v1
└── types.ts                # shared manifest/types
```

## Workstreams

### 1. Plugin registry and enablement

Implement a registry that discovers Claude plugins and resolves which ones are active for the current pi cwd.

Inputs to support:

- Claude marketplace/plugin directories on disk
- plugin manifest files (`.claude-plugin/plugin.json`)
- Claude enable/disable state (`installed_plugins.json`, `settings.json`, and scoped project settings where applicable)

Responsibilities:

- discover installed plugins
- parse manifests and component locations
- resolve effective enablement for the current cwd
- expose a normalized internal model like:
  - plugin id
  - source path
  - marketplace name
  - scope
  - enabled state
  - discovered components (`skills`, `commands`, `agents`, `hooks`, `bin`)

### 2. Skills and commands bridge

This is the best first deliverable because it has the clearest mapping to pi.

#### Commands

Approach:

- use `resources_discover` to surface plugin command markdown files as pi prompt templates
- preserve plugin identity via **namespacing**

Why namespacing matters:

- Claude commands are plugin-scoped
- pi prompt templates are global within a session
- collisions are likely without a plugin prefix

Recommended implementation direction:

- materialize namespaced wrapper prompt files into a generated temp/cache directory
- expose those generated prompt paths to pi rather than raw plugin command files

Possible naming shape:

- `/plugin-name:command-name`

#### Skills

Skills are trickier than commands because pi skill loading has naming and directory validation rules.

Need to prototype one of these approaches:

1. **Generated namespaced skill wrappers**
   - synthesize valid pi skill directories with namespaced names
   - point them back to the original plugin skill content
2. **Command-style wrappers for plugin skills**
   - expose plugin skills as namespaced prompt commands instead of native pi skills
   - lower fidelity, but simpler and collision-safe
3. **Input transform/runtime indirection**
   - intercept `/plugin:skill` and dispatch to underlying plugin skill content
   - may preserve nicer UX without depending on pi's native skill naming rules

Recommendation:

- start with commands first
- prototype skill wrapping separately before committing to a format

### 3. Agent bridge via pi subagents

Claude plugins can ship `agents/`. In pi, the closest equivalent is a custom subagent extension built on the subprocess pattern shown in pi's subagent example.

Responsibilities:

- parse plugin agent markdown/frontmatter
- maintain a registry of available plugin agents
- expose them to pi via:
  - a custom tool, and/or
  - custom commands, and/or
  - input transforms for Claude-like agent invocation patterns

Initial approach:

- use the pi subagent example as the execution base
- keep a plugin agent namespace such as `plugin-name:agent-name`
- focus on foreground execution first
- defer background/session-resume niceties until basic invocation works

Important scope note from Claude docs:

Plugin-provided agents are more restricted than standalone Claude agents. Plugin agents support fields such as `name`, `description`, `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, `skills`, `memory`, `background`, and `isolation`, but **do not** support plugin-shipped `hooks`, `mcpServers`, or `permissionMode` in agent frontmatter. That reduces the parity surface somewhat.

#### Agent runtime options

There are three realistic bases for agent execution:

##### Option A: pi's built-in subagent example

Pros:

- smallest baseline
- directly aligned with pi's official extension model
- easy to reason about and adapt to plugin namespacing
- lower maintenance and fewer bundled UX opinions

Cons:

- fewer advanced features out of the box
- likely requires custom work for richer chain/parallel/background behavior

Assessment:

- **recommended for v1**
- best fit for a narrow Claude marketplace agent bridge

##### Option B: `nicobailon/pi-subagents`

Pros:

- much richer agent runtime already implemented
- supports chains, parallelism, async/background runs, worktrees, management UI, and prompt/slash bridges
- useful reference for model fallback, execution orchestration, and future UX ideas

Cons:

- much larger and more opinionated surface area than this project currently needs
- packaged primarily as a complete subagent product/extension rather than as a small reusable runtime library
- brings built-in agents, manager UI, slash command conventions, async job lifecycle, and other behavior that may not match Claude marketplace compatibility goals
- increases dependency and semantic coupling for a first implementation

Assessment:

- **good reference, probably too large as the initial foundation**
- reconsider later if the project deliberately expands into a full subagent UX

##### Option C: custom minimal runtime

Pros:

- exact control over Claude-plugin-specific semantics
- can be purpose-built around plugin namespacing and manifest-driven behavior

Cons:

- duplicates work already demonstrated in the pi subagent example
- more implementation effort than necessary for the first milestone

Assessment:

- use only where the official subagent example is too small or awkward
- should be an evolution of Option A rather than a greenfield rewrite

#### Agent runtime recommendation

Use **Option A** as the initial execution base:

- start from the official pi subagent example
- keep the runtime focused on loading and executing plugin-provided agents
- borrow ideas from `pi-subagents` selectively rather than depending on it wholesale

Features from `pi-subagents` to keep in mind for later, if needed:

- chain / parallel orchestration
- worktree isolation
- model fallback
- richer slash-command UX
- async/background execution and status UI

### 4. Hook compatibility layer

This is where `pi-hooks` can help.

#### Recommended stance

Use `pi-hooks` as a **reference and possible implementation substrate** for Claude-style command hooks, but not as the entire marketplace solution.

Why:

- it already maps Claude-like hook configuration onto pi events
- it supports command hooks and several useful events
- but it does **not** currently provide full Claude hook parity
- and it does not solve plugin discovery, plugin hook loading, agent support, or marketplace install UX

#### v1 hook scope

Support only plugin `hooks/hooks.json` entries that are:

- `type: "command"`

Map them onto pi lifecycle/tool events using the same style as `pi-hooks`.

Likely supported events in v1:

- session start / shutdown
- user prompt submit
- pre-tool-use
- post-tool-use
- post-tool-use-failure
- stop / agent-end style completion
- compaction hooks if low effort

Defer:

- `http` hooks
- `prompt` hooks
- `agent` hooks
- perfect Claude JSON output parity if it complicates the runtime too early

Implementation options:

1. vendor/adapt the relevant logic from `pi-hooks`
2. add plugin-aware loading on top of `pi-hooks`
3. reimplement a smaller runtime inspired by `pi-hooks`

Preferred option:

- reuse ideas and code patterns from `pi-hooks`, but keep plugin loading and enablement under this package's control

### 5. `bin/` / `PATH` integration

Claude plugins can ship executables in `bin/` and make them available to shell commands.

In pi, this should be implemented by wrapping or overriding the `bash` tool behavior so enabled plugin `bin/` directories are prepended to `PATH`.

Requirements:

- only enabled plugins contribute `bin/`
- path ordering is deterministic
- project-scoped plugin bins only apply in matching projects
- behavior is visible and debuggable

This does not require a fork.

### 6. MCP bridge (later)

Treat MCP as a separate evaluation phase, not part of the initial milestone.

Questions for later:

- should Claude plugin `.mcp.json` be translated into a pi extension-managed MCP runtime?
- should MCP be intentionally omitted from the first package release?
- does pi need new extension APIs for MCP parity, or is an extension-managed bridge sufficient?

Recommendation:

- explicitly defer MCP until skills/commands/agents/hooks are proven valuable

## Delivery phases

### Phase 0 - discovery spike

Deliverables:

- plugin registry prototype
- parsed manifest model
- enablement resolution for current cwd
- sample output for a few real plugins

Exit criteria:

- can list enabled plugins and their discovered components reliably

### Phase 1 - commands first

Deliverables:

- plugin command discovery
- namespaced wrapper generation
- `resources_discover` integration
- `/reload` support

Exit criteria:

- commands from enabled plugins appear reliably with namespaced invocation
- no collisions with existing pi prompt templates

### Phase 2 - skill prototype

Deliverables:

- one viable namespacing strategy for plugin skills
- decision on native pi skills vs wrapped commands

Exit criteria:

- plugin skill invocation works without collisions
- the chosen approach is maintainable enough to scale

### Phase 3 - agents

Deliverables:

- plugin agent registry
- subagent runtime integration
- namespaced agent invocation

Exit criteria:

- at least one plugin-provided agent can be invoked end-to-end in pi

### Phase 4 - hooks

Deliverables:

- plugin hook loading
- command-hook execution for selected Claude events
- basic JSON input/output compatibility

Exit criteria:

- common plugin command-hook workflows run in pi

### Phase 5 - `bin/` integration

Deliverables:

- enabled plugin `bin/` directories injected into bash environment
- deterministic ordering and logging/debug info

Exit criteria:

- shell commands can invoke plugin-shipped binaries without manual PATH changes

### Phase 6 - MCP evaluation

Deliverables:

- written decision: support now, later, or never
- architecture note if support is pursued

Exit criteria:

- clear go/no-go based on actual blocker analysis

## Open design questions

1. **Skill namespacing strategy**
   - native pi skill wrappers
   - namespaced prompt wrappers
   - input transform indirection

2. **Agent UX**
   - explicit tool only
   - slash commands
   - input transform for Claude-like invocation
   - all three

3. **Hook execution source**
   - depend directly on `@hsingjui/pi-hooks`
   - vendor logic
   - reimplement a focused subset

4. **Plugin install UX**
   - should this package only consume already-installed Claude plugins?
   - or should it later grow install/update commands?

5. **Generated resource caching**
   - where to materialize wrapper files
   - when to invalidate/rebuild them
   - how to keep `/reload` fast and predictable

## Risks

### Resource collisions and validation friction

Pi applies its own validation rules to skills and prompt templates. Raw Claude resources may not load cleanly without adaptation.

### Partial hook parity

Even with `pi-hooks`, Claude hook compatibility will likely be partial at first, especially for non-command hook types.

### Agent semantics mismatch

Claude agent behavior and pi subagent behavior are similar but not identical. Expect some behavioral differences in permissions, prompting, and lifecycle.

### MCP complexity

MCP may become the first real reason to ask whether pi core needs new extension points.

### Security surface

This feature effectively imports third-party plugin behavior into pi. That means:

- shell hook execution
- PATH injection
- agent prompts from external plugin packages

The package should be explicit and conservative about what it enables.

## Fork decision gate

Only consider a pi fork if one or more of these turn out to be true after the extension approach is implemented:

1. namespaced plugin resources cannot be implemented cleanly with current extension APIs
2. plugin agents require first-class core support for acceptable UX/performance
3. MCP parity requires deep runtime access unavailable to extensions
4. a core-native `/plugin` install/manage UX is essential and cannot be layered on top

Until then, a fork is likely unnecessary maintenance overhead.

## Immediate next steps

1. Create `claude-marketplace/registry.ts` spike code for manifest + scope parsing.
2. Implement Phase 1 command import with generated namespaced prompt wrappers.
3. Prototype one namespaced skill strategy before committing to native skill loading.
4. Reuse the pi subagent example to validate plugin agent execution.
5. Evaluate whether to vendor or depend on `pi-hooks` for command-hook execution.

## References

### Pi docs and examples

- Pi extensions docs:  
  https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md
- Pi packages docs:  
  https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md
- Pi subagent example README:  
  https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/subagent/README.md

### Existing pi ecosystem references

- `ross-jill-ws/pi-claude-plugins` - skill/command marketplace bridge prototype:  
  https://github.com/ross-jill-ws/pi-claude-plugins
- `hsingjui/pi-hooks` - Claude-style command hook compatibility for pi:  
  https://github.com/hsingjui/pi-hooks

### Claude Code docs

- Discover plugins / marketplaces:  
  https://code.claude.com/docs/en/discover-plugins.md
- Create plugins:  
  https://code.claude.com/docs/en/plugins.md
- Plugins reference:  
  https://code.claude.com/docs/en/plugins-reference
- Subagents reference:  
  https://code.claude.com/docs/en/sub-agents
- Hooks reference:  
  https://code.claude.com/docs/en/hooks

### Notes derived from the references above

- Claude plugins may include `skills/`, `commands/`, `agents/`, `hooks/`, `.mcp.json`, `.lsp.json`, `bin/`, and `settings.json`.
- Plugin-provided agents are more restricted than standalone Claude agents.
- `pi-claude-plugins` proves the basic discovery/import idea for skills and commands.
- `pi-hooks` proves that Claude-style command hooks can be adapted onto pi's event model.
- Pi's own docs strongly suggest implementing this kind of functionality as an extension/package before considering any core fork.
