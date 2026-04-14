## 1. Extension scaffolding and shared types

- [ ] 1.1 Create the `claude-marketplace/` extension directory and register it in `package.json` publish/extension metadata
- [ ] 1.2 Add shared types and utilities for plugin manifests, scopes, compatibility state, component inventories, cache paths, and namespace formatting
- [ ] 1.3 Spike `resources_discover` with a tiny generated prompt directory to verify startup + `/reload` publication semantics in pi
- [ ] 1.4 Add a status formatter/command shell for inspecting discovered plugins, compatibility issues, resources, hooks, agents, and active bin paths

## 2. Plugin registry and scope resolution

- [ ] 2.1 Implement filesystem discovery for supported Claude plugin locations and parse `.claude-plugin/plugin.json`
- [ ] 2.2 Implement compatibility validation for the supported Claude plugin layout and surface incompatible plugins with explicit reasons
- [ ] 2.3 Implement enablement resolution for the current cwd using `installed_plugins.json`, `~/.claude/settings.json`, `.claude/settings.json`, and `.claude/settings.local.json` with scope precedence
- [ ] 2.4 Build a normalized in-memory registry API that reports discovered components, compatibility status, effective enabled state, and failure reasons
- [ ] 2.5 Add tests or fixtures covering malformed manifests, duplicate ids, incompatible layouts, and scope-specific enablement behavior

## 3. Command and skill resource wrappers

- [ ] 3.1 Implement generated prompt wrapper materialization for enabled plugin commands using `/plugin-id:command-name`
- [ ] 3.2 Implement v1 skill wrappers using `/plugin-id:skill:skill-name`, preserving source `SKILL.md` entrypoints and reference-doc paths
- [ ] 3.3 Wire wrapper publication into `resources_discover` for startup and reload, deleting stale wrappers before rebuilding
- [ ] 3.4 Add tests for command collisions, skill/command name overlap, progressive-disclosure wrapper behavior, and disabled-plugin wrapper removal

## 4. Plugin agent runtime

- [ ] 4.1 Build a narrow proof-of-concept from pi's subagent example to validate filtered tools, turn limits, streaming, and result collection
- [ ] 4.2 Implement agent discovery and frontmatter validation for enabled plugin `agents/` content
- [ ] 4.3 Register the `claude_plugin_agent` tool skeleton and namespaced agent lookup
- [ ] 4.4 Implement the subprocess runtime lifecycle for `claude_plugin_agent` based on the validated subagent pattern
- [ ] 4.5 Enforce supported policy fields such as allowed/disallowed tools, model, and `maxTurns`, and reject unsupported background execution clearly
- [ ] 4.6 Add smoke tests or fixtures for successful agent execution and unavailable-agent error handling

## 5. Command hook compatibility

- [ ] 5.1 Implement hook manifest parsing for enabled plugin `hooks/hooks.json` files and filter to supported `type: "command"` entries
- [ ] 5.2 Implement the v1 hook mapping table (`SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop`) onto pi session, input, and tool events with structured payload generation
- [ ] 5.3 Implement safe hook execution behavior so blocking pre-execution failures stop the current operation while post-event failures only warn
- [ ] 5.4 Add tests for supported event mapping, unsupported hook types, and failing hook behavior

## 6. Bin PATH integration

- [ ] 6.1 Compute the active plugin `bin/` directories for the current cwd using the normalized registry
- [ ] 6.2 Inject those paths into agent `bash` tool calls and `user_bash` commands with deterministic ordering
- [ ] 6.3 Expose active bin injections in the marketplace status output and add tests for scope leakage and ordering

## 7. Documentation and verification

- [ ] 7.1 Update `README.md` and `CLAUDE.md` with marketplace support scope rules, namespace conventions, supported Claude layout assumptions, security notes, and status command usage
- [ ] 7.2 Add an end-to-end fixture test that exercises discovery, wrapper publication, status reporting, and PATH injection against a synthetic Claude plugin setup
- [ ] 7.3 Run `pnpm typecheck`, `pnpm biome:ai`, `pnpm test`, and `pnpm pack:check`
- [ ] 7.4 Manually verify resource discovery, agent execution, hook execution, and PATH injection with a real or fixture Claude plugin setup
