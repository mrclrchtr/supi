# Opt-in local Reviewer Replays

Reviewer Sessions normally retain only bounded lifecycle diagnostics: repository evidence, commands, tool arguments/results, and conversation are not persisted. Prompt tuning and quality investigation sometimes need the actual investigator path, so `review.auditEnabled` is the sole explicit consent gate: when enabled, every task is captured locally rather than requiring another per-run request.

An enabled replay is a private file beneath Pi's agent directory with seven-day expiry and user-only permissions. It contains provider-visible messages, tool output, packet/protocol text, timing/usage, and the Workspace receipt; thinking blocks and thought signatures are removed. Normal review output exposes only an opaque id. The extension registers `supi_review_audit` once and activates it immediately only while Agent tools and auditing are enabled.

This keeps the ordinary product contract evidence-free while giving deliberate debugging runs enough context to evaluate review direction and resource use.
