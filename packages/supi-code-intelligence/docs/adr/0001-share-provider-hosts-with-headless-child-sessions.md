# Share provider hosts with headless child sessions

Concurrent in-process Pi sessions for one canonical workspace share a reference-counted Workspace provider host that starts LSP and structural providers once and stops them after the final lease is released; target and refactor handles remain private to each Workspace code-intelligence session. Reviewer children load a dedicated Headless inspection profile that registers only the six non-mutating inspection tools and omits refactors, settings, UI, overview injection, and other full-extension side effects.

This avoids duplicate language servers and process-global lifecycle races without making the full interactive extension reentrant or routing Reviewer Sessions through a package-specific tool factory.
