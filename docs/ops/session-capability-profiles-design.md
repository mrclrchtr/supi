# Session Capability Profiles

Status: implemented and reviewed. Focused checks, full verification, and package verification pass.

## Purpose and terms

- Let users save and reuse named tool and skill exclusions through configuration and `/supi-capabilities`.
- **Session Capability Profile**: a reusable named set of exclusions for extension tools and model-visible skills. All other eligible capabilities remain available.
- **Capability Profile Snapshot**: the session-owned copy of a profile at application time, including its identity, source, and exclusions.
- **Session Capability Override**: the current session's tool and skill restrictions. These can differ from the applied snapshot.
- Keep these terms separate from **Agent Profile**, which supplies instructions, model preferences, and allowed tools for a child Agent Run.
- The canonical glossary is [GLOSSARY.md](../../GLOSSARY.md).

## Scope

| Included | Excluded |
| --- | --- |
| Extension-tool and model-visible-skill exclusions | Model selection, thinking level, instructions, and prompts |
| User-defined global and trusted-project profiles | Changes to child Agent Profiles |
| Profiles tab in `/supi-capabilities` | Profile management in `/supi-settings` |
| Optional default for new sessions | Built-in profiles or a package-selected default |
| Session copies with a `Modified` marker | Live links from sessions to configuration |
| Exact tool and skill names | Package rules, patterns, or inheritance between profiles |
| Existing tool eligibility limits | Activation of startup-inactive tools or persistently disabled capabilities |

Profiles control model availability. They are not a security boundary and do not unload extensions. Skill exclusions hide skills from the model catalog; they do not remove explicit skill commands.

## Configuration

Use a dedicated `sessionCapabilities` section in the existing SuPi configuration files:

| Scope | Path | Access |
| --- | --- | --- |
| Global | `~/.pi/agent/supi/config.json` | User configuration |
| Project | `<cwd>/.pi/supi/config.json` | Read and write only when Pi trusts the project |

```json
{
  "sessionCapabilities": {
    "profiles": {
      "research": {
        "excludedTools": ["agent_run"],
        "hiddenSkills": ["implement"]
      }
    },
    "defaultProfile": "research"
  }
}
```

### Format rules

- `profiles` maps profile IDs to profile definitions.
- Use lowercase profile IDs with optional hyphens, such as `research` or `code-review`.
- `excludedTools` and `hiddenSkills` contain exact names. Omitted lists mean empty lists.
- Treat exclusion lists as sets. Duplicate entries and list order do not change their meaning.
- An empty profile is valid. It excludes nothing within the existing eligibility limits.
- Unknown fields and invalid value types produce a configuration error. Do not silently discard invalid values and apply a partial profile.
- Names that do not match the current inventory are valid exclusions, not structural errors.
- Do not store captured inventories, explicit tool enables, or session profile metadata in profile definitions.
- Preserve unrelated configuration sections and profiles when saving or deleting one profile.

### Profile resolution

1. Include global profiles.
2. Include project profiles only when the project is trusted.
3. For the same ID, the complete project definition replaces the global definition. Do not merge fields or exclusion lists.
4. An invalid project definition still blocks the same-ID global profile. Show the project error; do not silently use the global definition.
5. Keep other valid profiles available when one profile definition is invalid.
6. Removing a project definition exposes the same-ID global definition, if present.

The general SuPi config merge is not sufficient for this rule. Resolve profiles by ID, with whole-profile replacement, and explicitly enforce project trust.

### Default resolution

| Stored value | Global meaning | Trusted-project meaning |
| --- | --- | --- |
| Absent | No default | Inherit the global default |
| `null` | No default | Explicitly use no profile |
| Profile ID | Select the effective profile with that ID | Override the global default with that ID |

- Resolve the default selection by scope, then resolve its profile ID through the effective profile set.
- A global default can therefore select a same-ID project replacement in a trusted project.
- Untrusted project configuration affects neither the profile set nor the default.
- Apply the default only to a new session. Do not apply it on resume, fork, reload, or tree navigation.
- Without a configured default, retain normal startup behavior.
- If the selected default is missing or invalid, show a warning and start without profile exclusions. Do not claim that the profile is active or silently select another default.
- Keep startup application independent of the TUI. Do not add a profile prompt that blocks non-interactive startup.

## Exclusion behavior

- A profile is an exclusion set, not a fixed set of available capabilities.
- Newly installed or newly eligible tools and skills remain available unless an exact exclusion matches them.
- Exclude only eligible extension tools. Keep built-in and SDK tools outside these controls.
- Do not activate a tool that was inactive at startup or enable a persistently disabled skill.
- Apply skill exclusions through the existing optional skill provider. Keep saved skill exclusions even when that provider is absent.
- Retain unmatched exclusions in both the saved definition and the applied session state. If an item later becomes eligible, its exclusion must apply.
- Show unmatched names in profile details. Do not reject a profile or issue a startup failure only because an item is absent.
- Opening the selector or refreshing an inventory must not erase unmatched exclusions.
- Package rows remain bulk controls for current eligible tools. Saving their result stores exact tool names. A future tool in that package is not automatically excluded.

## Application and session lifecycle

### Apply

1. Resolve and validate the selected effective profile.
2. If it is unavailable or invalid, report the error and leave the current session unchanged.
3. Replace both current tool and skill exclusion selections with the profile's exclusions. Do not combine them with the previous profile.
4. Restore tools restricted by the previous session selection only within the existing eligibility and restoration rules.
5. Store the profile ID, resolved source scope, and original exclusion lists as the Capability Profile Snapshot.
6. Persist the current exclusions and snapshot through the existing hidden session-state mechanism.

Application does not write profile configuration. Later edits or deletion of the saved profile do not change the session copy.

### Session changes and identity

- Manual tool or skill changes affect only the session's current exclusions.
- Show the applied profile name and source in the selector. Show a short profile label in the footer.
- Add `Modified` when current exclusions differ from the snapshot's exclusion sets.
- Compare against the applied snapshot, not the current saved definition. Later configuration edits alone do not mark the session modified.
- If manual changes return the exclusions to the snapshot values, remove `Modified`.
- Saving or replacing a profile does not apply it, change the snapshot, or clear `Modified`.
- Applying a profile again resolves its current definition and creates a new snapshot.

### Lifecycle rules

| Event | Result |
| --- | --- |
| New session | Apply the optional effective default once |
| Resume | Restore stored exclusions and snapshot; do not apply the current default |
| Fork | Copy the source session's exclusions and snapshot |
| Reload | Retain session choices and snapshot; do not apply the default again |
| Tree navigation | Keep existing session-wide capability behavior; do not add branch-specific profile selection |
| Profile edited or deleted | Leave existing session copies unchanged |
| Project trust removed | Stop using project configuration; do not rewrite an existing snapshot |
| Old session without profile metadata | Keep its existing capability state without an active profile label |

Read configuration when needed for startup and selector operations. Do not add file watchers or continuous profile resolution.

## User interface

### Entry and timing

- Keep `/supi-capabilities` as the entry point.
- Add a **Profiles** tab beside **Tools** and **Skills**.
- Manual application and profile management remain selector-only. Add no command arguments, CLI flags, or model-callable tool.
- Retain the existing non-TUI warning for opening the selector.
- Before opening the selector, use the command context's existing `waitForIdle()` method. If waiting is necessary, show a short notice.
- Do not interrupt an active run. Use the session state after the wait.
- Keep this simple: no background queue, watcher, or new lifecycle system.

### Profile actions

| Action | Result |
| --- | --- |
| Apply | Replace session selections and capture a new snapshot |
| Save current as | Save the current exclusions, including unmatched names, under a new ID in an explicit scope |
| Replace saved profile | Confirm, then replace the selected scoped definition with the current exclusions |
| Delete | Confirm, then remove the selected scoped definition |
| Set default | Select an effective profile ID for an explicit scope |
| Use no default | Store explicit `null` in the selected scope |
| Inherit default | Remove the project default value so the global value applies |
| Reset global default | Remove the global default value so no default applies |

- Show source scope and any global definition hidden by a project definition.
- Require an explicit global or trusted-project scope for writes. Do not let an effective row hide which source will change.
- Do not silently overwrite an existing definition through Save current as. Use the confirmed replacement action.
- Report configuration write errors without claiming success.
- Do not add a separate Rename action in the first release. Use Save current as, then Delete.

### Deletion and defaults

- Leave default references unchanged when deleting a profile.
- Before confirmation, warn about known default references and about any global definition that deletion will expose.
- If deletion leaves a referenced ID unavailable, future new sessions use the missing-default warning behavior.
- If deletion exposes a global definition with the same ID, that definition becomes effective for future applications and new sessions.
- Deletion does not affect an already applied snapshot.

### Reset controls

- **Reset All** clears current tool and skill exclusions and the applied profile identity and snapshot.
- Restore tools only within existing eligibility and restoration rules.
- Do not edit saved profiles or defaults and do not reapply the default in the current session.
- Keep Reset Tools and Reset Skills limited to their current capability type. Differences from an applied snapshot affect the `Modified` marker.
- To restore a saved definition after a reset, explicitly apply it again.

## Ownership and implementation limits

| Package | Responsibility |
| --- | --- |
| `supi-core` | Shared profile types, validation, resolution rules, and session snapshot contracts |
| `supi-extras` | Scoped configuration operations, Profiles tab, default application, session integration, and footer state |
| `supi-skills` | Skill inventory and application of session skill exclusions without loss of unmatched names |

- Keep `supi-core` library-only. Use the existing `supi-core/session` public boundary for session contracts.
- Use the existing config and hidden-session-entry infrastructure. Do not create separate profile files or another persistence system.
- Retain unmatched skill names when the selector reads its inventory in `supi-extras/src/session-capabilities.ts`. The skills provider uses these exclusions without changing the stored lists.
- Keep saved exclusions separate from the current eligible inventory so validation and reconciliation cannot erase unmatched names.
- Keep the package layouts small. Do not add an extensible policy framework for two exclusion lists.
- No dependency change or ADR is required by this design.

## Acceptance checks

| Area | Required checks |
| --- | --- |
| Validation | Empty profiles and omitted lists work; unknown fields and invalid types report errors; duplicates do not change meaning |
| Scope | Global-only and project-only IDs coexist; a project definition replaces the whole same-ID global definition |
| Invalid override | An invalid project profile blocks global fallback for that ID; other valid IDs remain available |
| Trust | Untrusted project definitions and defaults are ignored; project writes are unavailable |
| Defaults | Absent project value inherits; `null` disables inheritance; a named default selects the effective profile |
| Startup failure | Missing or invalid default produces a visible warning and normal startup without a false active-profile label |
| Apply | Both exclusion lists replace prior selections; failed application leaves the current session unchanged |
| Eligibility | Built-in, SDK, startup-inactive, and persistently disabled capabilities remain outside activation control |
| New inventory | Unlisted new capabilities remain available; a later eligible exact-name match remains excluded |
| Missing inventory | Unmatched exclusions survive save, apply, selector opening, refresh, reload, and resume; an absent skill provider does not erase skill exclusions |
| Bulk selection | A package row saves current exact tool names, not a future package rule |
| Snapshot | Saved-definition edits, deletion, and later trust loss do not rewrite the applied copy |
| Modified | Manual changes set the marker; restoring the original exclusion sets clears it; list order and config edits alone do not set it |
| Persistence | Resume, fork, reload, and tree navigation do not reapply a new-session default; sessions without profile metadata still work |
| Save and replace | Explicit scope is used; replacement requires confirmation; writes preserve unrelated configuration; saving does not apply or change the snapshot |
| Delete | Confirmation explains default effects and global fallback; default references and active session copies remain unchanged |
| Reset | Reset All clears exclusions and snapshot, preserves configuration, and does not reapply the default |
| UI timing | Selector opening waits for idle through Pi's existing method; no background queue is introduced |
| Non-TUI | Selector remains unavailable; startup defaults do not require custom UI |

Implementation verification includes focused tests for profile rules and session integration, then `pnpm verify:ai`.

### Verification record

- Focused core profile, Extras, and Skills tests: 297 passed across 29 files.
- Core and Extras source/test TypeScript checks: passed.
- `pnpm verify:ai`: passed. This includes WASM checks, lint, workspace typechecks, skill checks, 4,312 passed tests with 2 skipped across 503 files, and all 22 package tarballs.
- Independent Standards review: passed with no findings.
- Independent Spec review: passed with no findings.
- The reviews used source inspection. The verification command supplied the test and build evidence.

## Evidence and source references

Repository sources inspected during the design session:

- [Core session capability state](../../packages/supi-core/src/session-capabilities.ts): current snapshot, decoder, registry, and fork copy.
- [Scoped configuration](../../packages/supi-core/src/config/config.ts): global/project paths and general merge behavior.
- [Capability extension](../../packages/supi-extras/src/session-capabilities.ts): command, persistence, lifecycle, and inventory retention.
- [Tool reconciliation](../../packages/supi-extras/src/session-capabilities-tools.ts): explicit choices and late tool handling.
- [Selector rows](../../packages/supi-extras/src/session-capabilities-ui-rows.ts): current tool, skill, and reset actions.
- [Agent glossary](../../packages/supi-agent/GLOSSARY.md): existing Agent Profile meaning.

Installed Pi sources, relative to `node_modules/@earendil-works/pi-coding-agent/`:

- `docs/extensions.md`: active tools, command contexts, hidden durable session data, and UI mode limits.
- `docs/configuration.md` and `docs/security.md`: project trust and process permissions.
- `dist/core/extensions/types.d.ts`: `ExtensionCommandContext.waitForIdle()` contract.

The rules above are the approved contract. The verification record states the checks completed for the implementation.
