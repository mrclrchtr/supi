# Split skill state ownership

A skill's effective state has separate load and model-invocation properties. Pi scoped settings own Skill Load, while scoped SuPi config owns Model Invocation overrides and applies them to Pi's generated skill prompt through public skill APIs; SuPi does not modify `SKILL.md`. This split preserves Pi resource behavior, supports project/global inheritance, and prevents package updates from removing user preferences.
