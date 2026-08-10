# Split skill state ownership

A skill's effective state has separate load and model-invocation properties. PI scoped settings own Skill Load, while scoped SuPi config owns Model Invocation overrides and applies them to PI's generated skill prompt through public skill APIs; SuPi does not modify `SKILL.md`. This split preserves PI resource behavior, supports project/global inheritance, and prevents package updates from removing user preferences.
