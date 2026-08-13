# supi-skills

Scoped skill availability and skill input shortcuts.

See also: root `CONTEXT.md` (Quality-of-Life).

## Language

**Skill Load**:
Whether PI loads a skill and makes its user command available.

**Model Invocation**:
Whether a loaded skill appears in the model's skill catalog. This preference remains when Skill Load is disabled.

**Model Invocation Override**:
A scoped, explicit choice for one skill's Model Invocation: enabled or disabled. When the choice is absent, the skill uses its source default or the broader scope.
_Avoid_: Skill Load setting, boolean skill flag

**Skill State Override**:
A scoped user choice for Skill Load or Model Invocation. A project choice takes precedence over a global choice, which takes precedence over the skill source.

**Enabled Skill**:
A loaded skill that is available to both the model and the user.

**Model Invocation Disabled Skill**:
A loaded skill that is available to the user but absent from the model's skill catalog.
_Avoid_: Hidden skill, manual-only skill

**Disabled Skill**:
An unloaded skill that is unavailable to both the model and the user.
