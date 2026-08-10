# Settings modules and config adapters

SuPi settings will use one canonical `SettingsModule` interface with asynchronous `read()` and `apply()` operations; actions are `set` or `unset`, and modules own all persistence and refresh behavior. `defineConfigSettings()` will adapt ordinary fixed SuPi config sections to this interface, while catalog-backed or multi-store settings implement it directly. This keeps the settings UI independent of storage, gives simple callers a small declarative surface, and avoids expanding the config schema with dynamic-resource and transaction concepts.
