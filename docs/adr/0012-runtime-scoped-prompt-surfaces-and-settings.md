# Runtime-scoped prompt-surface overrides and settings contributions

SuPi keeps its user-facing configuration in `~/.pi/agent/supi/config.json` and `.pi/supi/config.json`, but project-scoped tool prompt-surface overrides are model-facing instructions and are honored only when PI project trust is active for a PI-recognized trust-requiring resource. Tool prompt-surface overrides use one repo-wide shape, `<package-section>.tools.<tool_name>.promptSurface`, so single-tool and multi-tool packages share one convention instead of package-specific shortcuts. Extensions keep factory-time default tool registration, then re-register resolved prompt surfaces from `session_start`; `/supi-settings` collects config-backed settings contributions through PI's shared `pi.events` bus instead of a `supi-core` global registry because runtime contributions should be scoped to loaded extensions.

A resolved prompt surface starts from package defaults, applies global config, then applies trusted project config. Omitted fields inherit the lower layer; `$reset` restores listed fields to package defaults before same-scope explicit values; explicit values win after reset; and `prependPromptGuidelines` / `appendPromptGuidelines` compose around the effective guideline list. This avoids magic scalar values like `"default"` / `"inherit"`, which may be legitimate prompt text and would force awkward scalar unions.

Example:

```json
{
  "ask-user": {
    "tools": {
      "ask_user": {
        "promptSurface": {
          "$reset": ["description"],
          "description": "Custom project description",
          "appendPromptGuidelines": ["Use ask_user only after inspecting what can be inspected."]
        }
      }
    }
  }
}
```

**Considered Options**

- Put SuPi config under PI's native `settings.json`: rejected to preserve the existing SuPi config convention.
- Treat `.pi/supi/config.json` alone as trusted: rejected because PI does not gate that path and prompt-surface overrides can steer the model.
- Keep the settings singleton as the primary registry: rejected because settings contributions should be scoped to the currently loaded PI extension runtime; event-bus collection avoids stale process-global contributions across reload/session lifecycles and package module-isolation edge cases.
- Flat package-level prompt-surface keys or a single-tool shortcut: rejected because they would not scale to packages with multiple tools and would create two conventions.
- Magic field values such as `"default"` or `"inherit"`: rejected because those strings may be legitimate prompt text.
- Wildcard or package-level tool defaults: deferred as YAGNI until a real package needs cross-tool prompt customization.

**Consequences**

Project prompt-surface overrides in `.pi/supi/config.json` require a PI trust marker such as `.pi/settings.json` and a trusted project. Prompt-surface override merging belongs in a shared `supi-core` helper rather than in each extension package. Settings contribution helpers require `pi` and must add sections synchronously during the collection event. `/supi-settings` editing for long prompt strings is postponed; v1 is JSON config plus package documentation.
