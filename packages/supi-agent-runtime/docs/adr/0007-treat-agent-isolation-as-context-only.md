# Treat Agent Run isolation as context-only

Each Agent Run has a separate conversation and explicitly loaded PI resources but executes in-process with the containing PI process's filesystem, credentials, operating-system permissions, and external sandbox. Documentation and UI must say context-isolated and permission-shared, never sandboxed or write-protected; tool/profile policy is behavioral capability control, not a security boundary.
