# Glossary Map

Multi-context monorepo. Each package is an independent context with its own `GLOSSARY.md` and optionally `docs/adr/`.

- [supi-agent](./packages/supi-agent/GLOSSARY.md)
- [supi-agent-runtime](./packages/supi-agent-runtime/GLOSSARY.md)
- [supi-ask-user](./packages/supi-ask-user/GLOSSARY.md)
- [supi-code-intelligence](./packages/supi-code-intelligence/GLOSSARY.md)
- [supi-code-runtime](./packages/supi-code-runtime/GLOSSARY.md)
- [supi-consulting](./packages/supi-consulting/GLOSSARY.md)
- [supi-context](./packages/supi-context/GLOSSARY.md)
- [supi-core](./packages/supi-core/GLOSSARY.md)
- [supi-debug](./packages/supi-debug/GLOSSARY.md)
- [supi-extras](./packages/supi-extras/GLOSSARY.md)
- [supi-insights](./packages/supi-insights/GLOSSARY.md)
- [supi-installer](./packages/supi-installer/GLOSSARY.md) — standalone package-management CLI
- [supi-lsp](./packages/supi-lsp/GLOSSARY.md)
- [supi-prompt-improver](./packages/supi-prompt-improver/GLOSSARY.md)
- [supi-prompt-suggestions](./packages/supi-prompt-suggestions/GLOSSARY.md)
- [supi-review](./packages/supi-review/GLOSSARY.md)
- [supi-settings](./packages/supi-settings/GLOSSARY.md)
- [supi-skill-patches](./packages/supi-skill-patches/GLOSSARY.md)
- [supi-skills](./packages/supi-skills/GLOSSARY.md)
- [supi-test-utils](./packages/supi-test-utils/GLOSSARY.md)
- [supi-tree-sitter](./packages/supi-tree-sitter/GLOSSARY.md)
- [supi-web](./packages/supi-web/GLOSSARY.md)

Relationships:
- **supi-agent → supi-agent-runtime**: Agent Profiles compile Delegation Tasks into Agent Runs; the runtime owns the shared session registry, temporary transcripts, and `/agents` viewer. A Background Delegation Batch is a Background Run Batch: the runtime owns its ownership, Completion Notices, waiting, and Usage; `supi-agent` keeps admission and the result format.
- **supi-review → supi-agent-runtime**: Reviewer and Planner adapters resolve structured completions through Agent Runs. Reviewer Runs appear in the same registry; Review audit stays separate.
- **supi-insights → supi-debug, supi-agent-runtime**: The Insights Report reads persisted Agent Run and Tooling Retrospectives as Retrospective Evidence; the producers do not know Session Facets ([ADR 0027](./docs/adr/0027-retrospective-evidence-sources.md)).
- **supi-web → supi-agent, supi-review**: The loaded Web extension supplies Conditional Capabilities and Reviewer Web Access to child sessions; neither consumer depends on supi-web ([ADR 0026](./docs/adr/0026-session-provided-web-capabilities.md)).

System-wide context lives in the root [GLOSSARY.md](./GLOSSARY.md) and [system-wide ADRs](./docs/adr/).
