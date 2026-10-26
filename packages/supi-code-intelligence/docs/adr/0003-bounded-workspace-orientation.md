# Bounded workspace observations

**Status:** Accepted.

Supersedes the content, rendering, and warning decisions in [Workspace Overview](0002-opt-in-workspace-overview.md). The default-enabled scoped setting and headless isolation remain unchanged.

## Decision

| Area | Rule |
| --- | --- |
| Shared observation | Overview and workspace/directory Orientation use the same filesystem and metadata interface. It also works without package metadata. |
| Automatic boundary | The session working directory is the root. Ancestor repositories and workspace manifests do not expand it. An explicit focus is a separate request. |
| Inclusion | Include Git-tracked and non-ignored untracked files, subject to configured exclusions. Keep ignored-but-tracked files. Without Git, use accessible files and configured exclusions. Do not classify directories by their names. |
| Links | Record symbolic links, but do not follow them during navigation collection. |
| Metadata | Parse explicit Node, Python, Rust, and Go declarations. Preserve native kinds, fields, values, and manifest identities. Static readers never run project code or build tools. Separately authorized Gradle model observations are the explicit execution exception below. |
| Descriptions | Retain source-written prose with its source field. Treat it as untrusted evidence. Do not generate responsibilities or architectural roles. |
| Relationships | Directory-focused output uses Mermaid. Keep separate dependency fields between the same pair of projects. Name matches do not establish installed resolution or runtime architecture. |
| Context independence | Each tool response must work without the overview or earlier tool output. Do not suppress ordinary facts based on session history. |
| Overview budget | Warn above 1,000 estimated tokens; cap navigation at 2,000. |
| Orientation budget | Warn above 2,000 estimated tokens; cap workspace/directory navigation at 4,000. |
| Estimate | Use `ceil(characters / 4)`. Select deterministically. Keep names and paths before descriptions. Per-list limits cannot bypass the total cap. |
| Compact provenance | Group declarations by observed kind and exact project-relative identity source. Group memberships only when kind, manifest, field, and value match. Apply list limits before grouping and retain counts of declarations and individual memberships. Refer to a listed project set only when its identities exactly match the selected members; otherwise name member paths explicitly. |
| Warning channel | Send soft warnings to UI and debug, not model-facing text. |
| Omitted evidence | Link captured details in the overview only when navigation rows or descriptions are omitted. Explicit workspace/directory Orientation also preserves raw inventory evidence. Captures retain raw collected facts and the complete navigation rendering. Use a concise notice that identifies the file as not a fresh scan; retain explicit recovery guidance when the hard cap removes the inline map. |
| Instructions | Keep applicable trusted instruction files inline once per context, with branch-aware deduplication and re-delivery after compaction. Their budget is separate from navigation. |
| Instruction limits | Keep the 200-line per-file limit and the final tool safety limit. Identify unread remainders. Do not record text as supplied when it was not shown. |
| Scope | Keep file- and symbol-focused navigation unchanged. |

## Collection limits

- Retain at most 10,000 inventory entries by default. Visit an explicit in-root directory first, with the same exclusions. An external directory uses a separate observation.
- Read at most 1 MiB per metadata file.
- Use the caller's cancellation and deadline. The first-turn collector sets a 10-second deadline.
- Report collection errors, limits, and unsupported metadata. Empty collected results do not prove that an incomplete scan found every file or declaration.
- Do not replace a failed Git inventory with a broader filesystem scan. A missing Git executable permits a disclosed filesystem fallback.
- Configuration exclusions are not access controls. An exact ignored or excluded directory can have its own observation.

## Authorized Gradle model observations

| Area | Rule |
| --- | --- |
| Selection | One selected build: session working directory for Overview/workspace Orientation, exact explicit directory for directory Orientation. Require a regular settings file there; no ancestor search or independent nested-build scheduling. |
| Evidence | Request `BuildEnvironment` for runtime verification, then only `GradleBuild` / `BasicGradleProject`. Keep model observations separate from parsed Project declarations. Identity is build-root identity plus logical project path. Preserve names, parent paths, actual directories, and included-build references without expanding their trees. No source ownership, resolution, architecture, or original declaration-field/range claims. |
| Runtime | Gradle 9 only. Prefer wrapper-declared distribution; absent properties permit an identified PATH installation. Never silently substitute the client version or override unsupported wrappers. Fail closed on unidentifiable archive names or opaque version-manager shims. Use installed compatible Java, never provision a JDK. Exact qualification and artifact/license references live in the helper README. |
| Authorization | Project-only unset/Allow/Deny in `.pi/supi/config.json`, plus an actual Pi project-trust gate. Pi's implicit trusted state for a directory without protected resources is insufficient: require saved Pi trust there. External roots require their own saved approval. A repository-supplied Allow value alone never authorizes execution. |
| Interaction | Ask at eligible interactive startup only when unset. Explain arbitrary settings/plugin execution, possible downloads/cache writes, and access beyond the reporting root. Persist Allow/Deny; Cancel does not persist. Without UI, unset means no execution. |
| Changes | Project-only `/supi-settings` editor; changes affect the next query. Reset deletes the key and restores asking at the next eligible startup. Deny/reset cancel owned work where possible. Cancellation does not reverse side effects or stop unrelated daemons. |
| Bounds | Existing inventory, metadata, request deadline (including Overview's 10 seconds), token budgets, captures, and untrusted-evidence rules stay in force. The JVM helper additionally caps model output at 1 MiB and 10,000 projects. These bounds do not sandbox Gradle. |
| Failure | Retain generic navigation and disclose blocked, unavailable, interrupted, unsupported, failed, expired, or oversized model collection; never equate these with no projects. No retries, CLI-report parsing, or stale-model reuse. |
| Non-goals | No Maven/CMake, Gradle ≤8 or ≥10, recursive included-build queries, task scheduling, dependency/task/source-set/IDE models, or changes to language support/LSP readiness/static readers. |

## Captured results

- The file contains facts already collected for that request, not a promise that every possible repository fact was collected.
- Raw inventory entries and native project declarations remain available when the inline map groups or omits them.
- Keep parsed workspace patterns and exclusions, including unmatched values. Derived memberships do not replace their source declarations.
- Files use private permissions and temporary storage. They are not durable session artifacts.
- A focused Orientation call makes a new observation. Reading a captured file does not.

## Consequences

- The initial overview is a bounded navigation map, not a complete inline inventory.
- Generic files remain useful when metadata is absent or unsupported.
- Metadata readers can report unsupported semantics instead of guessing.
- Presentation owns selection and captured-result creation. Collection does not depend on prior model context.
- Only supplied instruction snippets update the branch delivery record.

## References

- [Approved agent-output examples](../orientation/target.md)
- [Pre-change agent-output examples](../orientation/current.md)
- [Domain glossary](../../GLOSSARY.md)
- [Tool architecture](../../../../docs/conventions/tool-architecture.md)
- [Gradle helper qualification, packaging, and licenses](../../gradle-helper/README.md)
- [Pi project-trust semantics](https://github.com/earendil-works/pi/blob/main/docs/security.md#project-trust)
- [Pi context architecture](../../../../docs/pi/context-architecture.md)
