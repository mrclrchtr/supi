<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-skills">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-skills/assets/social-preview.png" alt="SuPi Skills" width="100%">
  </a>
</div>

# @mrclrchtr/supi-skills

Adds scoped skill controls and `$skill-name` input shortcuts to the [PI coding agent](https://github.com/earendil-works/pi).

## Install

Install the shared settings UI and this package:

```bash
pi install npm:@mrclrchtr/supi-settings
pi install npm:@mrclrchtr/supi-skills
```

For local development:

```bash
pi install ./packages/supi-skills
```

## Skill controls

`/supi-settings` includes a searchable **Skills** section. Each skill has one of these effective states:

- **Enabled** — PI loads the skill, and the model can invoke it.
- **Model invocation disabled** — PI loads the skill for explicit user commands but omits it from the model's skill catalog.
- **Disabled** — PI does not load the skill or its command.

Use `Tab` to switch between project and global scope. Project settings inherit global settings, and trusted project overrides take precedence. SuPi stores model-invocation preferences without changing `SKILL.md`; full load changes use PI resource settings and require `/reload`.

Skills that an extension adds only at runtime support Enabled and Model invocation disabled. PI does not provide a persistent load setting for these resources. PI exposes only the active source after a name collision, so disabling a static winner can reveal a runtime source after reload. The refreshed row then shows the runtime limitation.

## Config shape

SuPi stores Model Invocation overrides as per-skill records in the SuPi config:

```json
{
  "skills": {
    "$schemaVersion": 2,
    "review": {
      "modelInvocation": "disabled"
    }
  }
}
```

Use `enabled` or `disabled` as the stored value. An absent record or field inherits the source default, global value, or project value. Skill Load remains in PI's native settings. SuPi adds the schema marker so a skill named `modelInvocation` can use an ordinary record.

Older versions stored boolean values in `skills.modelInvocation`. SuPi reads that format and migrates valid entries on the next settings write. Invalid values remain preserved, marked as invalid, and produce a warning until they are repaired. A conflicting legacy fallback is kept under `$legacyModelInvocation` until the invalid record is repaired.

## Input shortcut

`$skill-name` expands to `/skill:skill-name`. Skill-only autocomplete is active while the cursor is in a `$...` token.

Installed skill names are captured at `session_start`. Use `/reload` after you add or remove skills.

## Credit

The skill controls are inspired by [Whamp/pi-skill-toggle](https://github.com/Whamp/pi-skill-toggle). SuPi uses PI's resource interfaces and shared settings UI instead of the upstream custom overlay and theme configuration.
