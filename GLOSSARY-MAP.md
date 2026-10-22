# Glossary Map

Multi-context monorepo. Each package is an independent context with its own `GLOSSARY.md` and optionally `docs/adr/`.

- [supi-agent](./packages/supi-agent/GLOSSARY.md)
- [supi-agent-runtime](./packages/supi-agent-runtime/GLOSSARY.md)
- [supi-ask-user](./packages/supi-ask-user/GLOSSARY.md)
- [supi-bash-timeout](./packages/supi-bash-timeout/GLOSSARY.md)
- [supi-cache](./packages/supi-cache/GLOSSARY.md)
- [supi-claude-md](./packages/supi-claude-md/GLOSSARY.md)
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
- **supi-agent → supi-agent-runtime**: Agent Profiles compile Delegation Tasks into Agent Runs; the runtime owns the shared session registry, temporary transcripts, and `/agents` viewer.
- **supi-review → supi-agent-runtime**: Reviewer and Planner adapters resolve structured completions through Agent Runs. Reviewer Runs appear in the same registry; Review audit stays separate.

System-wide context lives in the root [GLOSSARY.md](./GLOSSARY.md) and [system-wide ADRs](./docs/adr/).
