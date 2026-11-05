---
status: accepted
---

# Provide Web tools to child sessions from the loaded Web extension

Agent Runs and Reviewer Sessions receive `supi-web` tools only when the containing session currently provides them. The loaded Web extension supplies a Web-specific child integration through one shared contract used by both `supi-agent` and `supi-review`. Neither package bundles or depends on `supi-web`. Each invocation captures the callable Web tools once, and Delegation Follow-Ups capture them again. Unavailable tools are silently absent rather than startup failures. Agent Profiles select individual Web tools as Conditional Capabilities, and the built-in `explore` and `general` profiles allow all four. Review requires the default-off Reviewer Web Access setting and grants Web tools only during investigation. Web content can support findings but never replaces Target Evidence. Web tools stay read-only for batch admission under existing Web network and cost settings.

## Considered Options

- **Bundle `supi-web` into child-capable packages:** rejected. Every install would carry Web runtime dependencies, and Web would work in children even if it was absent from the parent.
- **Generic child-capability registry for any extension:** rejected. It would let third parties classify their tools as read-only or mutation-capable and would conflict with the fixed child capability set ([supi-agent ADR 0002](../../packages/supi-agent/docs/adr/0002-use-a-fixed-child-capability-set.md)).
- **Forward parent tool closures (`ctx.executeTool`):** rejected. Background runs outlive the parent tool call, and `/supi-review` commands have no tool context.
- **Fail startup when an allowed Web tool is missing:** rejected. Allowed Web tools are a ceiling, not a requirement. Required non-Web tools keep strict readiness.

## Consequences

- A tool counts as available when the parent can call it under Pi exposure rules. Parent-deactivated direct tools stay unavailable, while declarations hidden only from the prompt but callable through codemode stay available.
- Children mirror the parent's lazy credential behavior: Context7 tools without `CONTEXT7_API_KEY` remain present and fail on call.
- Child Web tools read Web settings (such as Firecrawl) from the containing session's directory, not the child's cwd, so a frozen Review Workspace cannot change the parent's network or cost policy.
- Existing parent `supi-web` warnings are unchanged; the integration adds no new warnings.
- Direct and codemode calls in a child use the same effective tool set.
