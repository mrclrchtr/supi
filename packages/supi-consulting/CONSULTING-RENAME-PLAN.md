# Consulting rename plan

## Status and decisions

The user approved this design in a planning session, then explicitly authorized implementation.

| Decision | Approved choice |
| --- | --- |
| Feature and package | Consulting; `@mrclrchtr/supi-consulting` |
| Domain operation | Consultation |
| Tool | `consulting_run` |
| Preparation for other agents | One private adapter interface; one Antigravity adapter |
| Agent selection | Require `new.agent: "antigravity"` |
| Compatibility | Clean break; no aliases, legacy reads, or automatic migration |
| State | `<PI agent dir>/supi/consulting/antigravity/` |
| Future runtime option | `supi-agent-runtime` integration is outside this change |

## Scope

Rename SuPi-owned package, directory, interface, state, and documentation identities. Separate consultation policy from Antigravity-specific execution. Keep Antigravity as the only supported Consulting Agent.

Preserve the beta, opt-in install policy, current models, explicit Workspace Access, evidence classification, output limits, cancellation, and branch-aware Conversation Handles.

Do not add another agent, a plugin registry, a public library interface, model defaults, automatic fallback, an Agent Run registry, or an `supi-agent-runtime` dependency. Do not publish packages or run paid live probes as part of normal verification.

## Proposed domain language

Apply these changes to `CONTEXT.md` during implementation. Keep implementation details in this plan and package guidance, not in the glossary.

**Consultation**:
One bounded request to a Consulting Agent that returns an answer and execution evidence. It can start a conversation or continue one through a Conversation Handle.
_Avoid_: Antigravity Run, Agent Run, child session

**Consulting Agent**:
An agent selected to perform a Consultation. Antigravity is the only supported Consulting Agent in this change.
_Avoid_: Agent Profile, PI model provider, model

**Workspace Access**:
The caller's decision to expose the current PI workspace to a Consultation. A Consultation without Workspace Access uses the selected agent's Consultation Workspace.
_Avoid_: consult mode, explore mode, repository mode

**Consultation Workspace**:
A package-managed empty project for Consultations without access to the current PI workspace. Its stable identity keeps agent-specific permissions and conversations separate from the current workspace.
_Avoid_: temporary workspace, sandbox, current workspace

**Model Catalogue**:
The immutable model choices available through one Consulting Agent for the current session. A new Consultation selects one entry explicitly.
_Avoid_: PI model list, default model, all provider models

**Conversation Handle**:
An opaque SuPi identifier for an observed conversation with one Consulting Agent. It retains the original agent, model, working directory, and Workspace Access.
_Avoid_: raw conversation ID, Agent Run Handle, session ID

Keep Observed Evidence, Web Evidence, and Workspace Evidence agent-neutral. Keep Isolated Antigravity Home and Inspection Permission Set explicitly Antigravity-specific. Remove the historical Walking Skeleton term from the active glossary; retain its original plan as historical material.

## Public contract

```ts
consulting_run({
  prompt: string,
  new?: {
    agent: "antigravity",
    workspace: boolean,
    model: string // One entry from the discovered Antigravity Model Catalogue.
  },
  continue?: { handle: string }
})
```

- Require exactly one of `new` and `continue`.
- Require all three `new` fields. Do not infer an agent or model.
- Build the agent and model enums from the registered, immutable availability snapshot. Only `antigravity` is supported.
- Reject unsupported agents and unavailable models before execution.
- Follow-ups inherit agent, model, Workspace Access, and canonical working directory. Reject override fields.
- Preserve the root object schema and its exact-one cardinality. Use `StringEnum` for enum fields.
- Register only after availability discovery succeeds. Keep discovery asynchronous and cancellation-safe.
- Keep dynamic-tool guidance description-only. Put field-specific rules in the schema.

## Identifier map

| Current | Target |
| --- | --- |
| `packages/supi-antigravity/` | `packages/supi-consulting/` |
| `@mrclrchtr/supi-antigravity` | `@mrclrchtr/supi-consulting` |
| `antigravity_run` | `consulting_run` |
| `src/tool/antigravity_run/` | `src/tool/consulting_run/` |
| `antigravity.agentToolEnabled` | `consulting.agentToolEnabled` |
| Settings label `Antigravity` | `Consulting` |
| Tool label `Antigravity Run` | `Consultation` |
| Footer key `supi-antigravity` | `supi-consulting` |
| Custom entry `supi-antigravity-handle` | `supi-consulting-handle` |
| Handle prefix `agy_` | `consult_` |
| `SUPI_ANTIGRAVITY_LIVE` | `SUPI_CONSULTING_LIVE` |
| Package-owned temporary prefixes | `supi-consulting-*` |

Rename package-level code to `Consulting*` / `CONSULTING_*`: configuration, runtime, settings, footer, tool registration, and extension factory. Rename shared answer, usage, evidence, progress, and result types to `Consultation*`. Store agent identity and an opaque continuation value instead of a shared `rawAntigravityId` field.

Keep agent-specific names inside the Antigravity adapter: CLI version parsing, process errors, event parsing, isolated home, curated model IDs, and authentication. Preserve `agy`, `AGY_CLI_DISABLE_AUTO_UPDATE`, `.gemini/antigravity-cli/settings.json`, CLI flags, event names, and `antigravity.keychain-db`.

## Private adapter interface

### Shared consulting module

Own:

- PI lifecycle, settings, footer, tool metadata, input validation, and activation.
- Explicit Workspace Access and canonical working-directory choice.
- Conversation Handle acquisition, release, retirement, and branch reconstruction.
- Validated reference classification, bounded result assembly, and rendering.
- Neutral model identifiers validated against the selected agent's catalogue.

The composition point constructs the one Antigravity adapter. Shared workflow and rendering must not import Antigravity process modules or interpret its tool names.

### Antigravity adapter

Own:

- Isolated home, permissions, private macOS keychain, login instructions, and model discovery.
- Antigravity models and minimum CLI version.
- Project-hook probes, environment filtering, process startup, cancellation, and bounded streams.
- Stream-JSON parsing, structured-answer validation, raw conversation IDs, and tool-activity classification.

Expose a small private interface for discovery and execution. Return normalized answer, usage, observed-reference hashes, activity flags/counts, bounded warnings, and opaque continuation state. Expose only the empty Consultation Workspace path needed by shared policy, not the authentication home.

Execution must accept cancellation and progress callbacks. It must report when process work starts, including a hook probe, so shared code can preserve handle retirement semantics. Report hook warnings before the paid process starts. Validate continuation identity inside the adapter.

Move the evidence-hash primitive to a neutral leaf module used by both the adapter and result classification. Do not pass raw events, stdout, stderr, credentials, or transcripts through the interface.

### Suggested layout

```text
src/
  extension.ts
  runtime.ts
  config.ts
  settings.ts
  footer.ts
  footer-constants.ts
  types.ts
  catalogue.ts
  evidence.ts
  agents/
    types.ts
    antigravity/
      adapter.ts
      availability.ts
      isolated-home.ts
      models.ts
      structured-output.ts
      activity.ts
      process/
  conversation/handles.ts
  tool/consulting_run/
```

Keep exports limited to `./extension` and `./package.json`. Keep `supi-core` bundled. Do not add pass-through `api.ts` or `index.ts` files.

## State and compatibility

Create new state only under:

```text
<PI agent dir>/supi/consulting/antigravity/home/
<PI agent dir>/supi/consulting/antigravity/consultation-workspace/
```

- Leave `<PI agent dir>/supi/antigravity/` untouched and unused.
- Require a new isolated sign-in. Do not copy credentials or link the old home.
- Read only the `consulting` settings section. Retain `agentToolEnabled: true` as the default; explain that an old disabled setting does not carry over.
- Read only the new custom-entry type and `consulting_run` result details. Ignore old tool results and handle records.
- Bind new handle records to the agent and opaque continuation state. Validate records before branch reconstruction.
- Reject unknown, busy, retired, and unsupported-agent handles before process work.
- Preserve branch-specific retirement. Pre-process failures release a handle; failures or cancellation after process work starts retire it.
- Do not modify old session files, sign-in state, settings, or npm packages automatically.

## Reference and documentation inventory

| Area | Required work |
| --- | --- |
| Package manifest | Name, description, consulting keyword, repository directory, homepage, and package image URL; preserve the Antigravity keyword as the supported agent |
| Root integration | `package.json` extension path, `release-please-config.json`, `vitest.workspace.ts`, and lockfile importer |
| Package source/tests/scripts | Tool directory, shared identifiers, imports, test names, fixtures where package-owned, live-probe gate and temporary paths |
| Root docs | README package catalog/install command and `CONTEXT-MAP.md` |
| Package README | Consulting capability, supported agent, required `new.agent`, new handles/config/state, sign-in, switch instructions, and unchanged security limits |
| Package instructions | `CLAUDE.md` ownership rules, adapter interface, new tool/result paths, verification, and live-probe gate |
| Domain docs | Apply the glossary above; update package map identity without adding a runtime relationship |
| Existing ADR | Keep its Antigravity-specific title and filename; update the package owner and Consultation wording |
| Existing `PLAN.md` | Add a historical-status notice and links to current docs; preserve the original specification as history |
| Shared prompt tests | Update `scripts/__tests__/tool-prompt-surface.test.mjs`; check serialized schema and manifest-driven tests |
| Footer integration | Update the contribution key in `packages/supi-extras/__tests__/unit/supi-footer.test.ts` |
| Research skill | Edit the source fragment under `packages/supi-skill-patches/patches/mattpocock-skills/files/skills/engineering/research/`; regenerate combined patch and root skill; update maintenance test |
| Package conventions | Add the consulting package to the layout matrix |

Do not rewrite released `CHANGELOG.md` entries. Old identifiers may remain in historical material, switch instructions, this plan, and negative compatibility tests. Every other old identifier must have an explicit Antigravity-specific purpose.

## Implementation order

1. Save this plan. Rename the directory and update package/root/release manifests. Run `pnpm install` before source edits.
2. Rename the public tool and package-owned identifiers. Add required agent selection and clean-break state tests at the agreed interfaces.
3. Extract the Antigravity adapter. Move protocol assumptions out of shared workflow, handles, evidence classification, and rendering.
4. Preserve behavior through focused tests and typechecking. Add fake-adapter coverage for the shared workflow and retain fake-CLI process coverage.
5. Update docs, root references, and skill patch source. Run `pnpm skills:patches:compose`, `pnpm install`, and `pnpm skills:sync`.
6. Run full verification, inspect the old-name inventory, and review the complete change against this plan.

## Verification and acceptance

Test at the registered `consulting_run` interface and the private Consulting Agent adapter interface. Retain existing process, handle, settings, and packaging regression tests.

Required cases:

- New package loads through root and standalone manifests; old tool is not registered.
- New input requires the supported agent, available model, and Workspace Access; follow-up accepts only a handle.
- New and continued Consultations preserve observed versus claimed evidence, path containment, token usage, and result limits.
- Shared workflow works with an injected test adapter without Gemini model types or Antigravity events.
- Same-handle overlap, branch reconstruction, pre-process errors, started failures, cancellation, and different conversation IDs retain their safeguards.
- New state paths are agent-specific; legacy state remains byte-identical and is not read or migrated.
- Authentication environment filtering, private keychain handling, inspection permissions, hook warnings, and empty-workspace behavior remain intact.
- Settings disable discovery and the tool. Footer status uses the new key without changing its lifecycle.
- Generated research skill uses `consulting_run` and still treats its answer as synthesis, not a primary source.
- Schema serialization, prompt budgets, release wiring, npm-compatible packaging, and source import cycles pass.

Run focused tests and package/test typechecking during implementation. Run `pnpm verify:ai` at completion; it includes the full tests and package verification. Use `node scripts/publish.mjs packages/supi-consulting` for a focused pack check if needed, without `--publish`.

The optional live probe is `SUPI_CONSULTING_LIVE=1 pnpm exec jiti packages/supi-consulting/scripts/live-probe.ts`. It requires separate approval and sign-in; normal tests must never invoke it.

## Implementation and verification record

- Implementation is complete. The evidence-hash leaf is `src/evidence-hash.ts`; safe adapter failures use `src/agents/errors.ts`.
- Adapter errors contain fixed messages and safe categories, not raw diagnostics or causes. Tests cover process errors, preparation failures, and cancellation through the adapter interface.
- Fixture conversations have distinct identities. Tests detect missing continuation arguments, reject changed conversation IDs, and verify handle retirement.
- Invalid discovery snapshots stop the footer spinner and do not register the tool.
- Focused package verification: 73 tests passed; source/test typechecking and Biome passed.
- Final `pnpm verify:ai`: 475 test files passed; 4,026 tests passed and 2 skipped; all 22 publishable packages passed staging and tarball verification.
- Independent Standards and Spec reviews passed with zero remaining findings after fixes.
- No live probe, package publication, state migration, or user-data deletion was performed.
