# supi-skills

Scoped skill availability and skill input shortcuts.

See also: root `CONTEXT.md` (Quality-of-Life).

## Language

**Skill Load**:
Whether PI loads a skill and makes its user command available.

**Model Invocation**:
Whether a loaded skill appears in the model's skill catalog. This preference remains when Skill Load is disabled.

**Skill State Override**:
A scoped user choice for Skill Load or Model Invocation. A project choice takes precedence over a global choice, which takes precedence over the skill source.

**Enabled Skill**:
A loaded skill that is available to both the model and the user.

**Model Invocation Disabled Skill**:
A loaded skill that is available to the user but absent from the model's skill catalog.
_Avoid_: Hidden skill, manual-only skill

**Disabled Skill**:
An unloaded skill that is unavailable to both the model and the user.
