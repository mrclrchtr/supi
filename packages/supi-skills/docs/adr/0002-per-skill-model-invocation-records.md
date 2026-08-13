# Per-skill Model Invocation records

SuPi stores a skill's Model Invocation override at `skills.<skill>.modelInvocation` as the explicit string value `enabled` or `disabled`. The `skills.$schemaVersion` marker is `2`. An absent value means that the skill inherits its source default or broader scoped value. Skill Load remains owned by PI's native resource settings.

This replaces the old boolean map because the per-skill record makes the controlled property clear, avoids the inverted boolean meaning, and leaves room for other skill settings. Existing boolean entries are read during migration. Valid entries become records on the next write. Invalid legacy values keep their raw value with an invalid marker and produce a warning. If an invalid new record also has a legacy fallback, the fallback is kept under `$legacyModelInvocation` until the record is repaired.
