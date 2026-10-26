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
| Metadata | Parse explicit Node, Python, Rust, and Go declarations. Preserve native kinds, fields, values, and manifest identities. Never run project code or build tools to infer facts. |
| Descriptions | Retain source-written prose with its source field. Treat it as untrusted evidence. Do not generate responsibilities or architectural roles. |
| Relationships | Directory-focused output uses Mermaid. Keep separate dependency fields between the same pair of projects. Name matches do not establish installed resolution or runtime architecture. |
| Context independence | Each tool response must work without the overview or earlier tool output. Do not suppress ordinary facts based on session history. |
| Overview budget | Warn above 1,000 estimated tokens; cap navigation at 2,000. |
| Orientation budget | Warn above 2,000 estimated tokens; cap workspace/directory navigation at 4,000. |
| Estimate | Use `ceil(characters / 4)`. Select deterministically. Keep names and paths before descriptions. Per-list limits cannot bypass the total cap. |
| Compact provenance | Group declarations by observed kind and exact project-relative identity source. Group memberships only when kind, manifest, field, and value match. Apply list limits before grouping and retain counts of declarations and individual memberships. Refer to a listed project set only when its identities exactly match the selected members; otherwise name member paths explicitly. |
| Warning channel | Send soft warnings to UI and debug, not model-facing text. |
| Omitted evidence | Give the agent a path to the complete captured result. Preserve raw collected facts as well as the complete navigation rendering. Reading the file does not scan again. |
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
- [Pi context architecture](../../../../docs/pi/context-architecture.md)
