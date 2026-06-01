# Task 3: Wave 1c: Narrow code_refactor operations to rename_symbol only

Reduce CodeRefactorParameters operation enum from 6 operations to just ["rename", "rename_symbol"]. Keep internal normalizeRequestedOperation accepting all for backward compat but don't advertise unsupported ops. Update tool-specs description and guidelines.
