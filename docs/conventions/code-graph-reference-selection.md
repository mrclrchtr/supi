# Graph reference selection

**Status:** Implemented.

## Scope

- Improve the Coding Agent's view of references returned by `code_graph` under a Result cap.
- Change reference selection and its Read-next guidance, not reference collection or semantic identity.
- Keep implementations, structural callees, target-candidate selection, and Orientation unchanged.
- Keep existing public parameters, structured output fields, relation budgets, and refactor behavior.
- Do not add pagination, automatic follow-ups, a relevance classifier, or a TUI redesign.

## Previous behavior and retained collection

- Semantic reference locations are normalized, validated, deduplicated, and ordered by file, line, and character before project-location selection. This collection behavior is unchanged.
- Graph assembly previously selected the first `maxResults` reference locations. Markdown grouped those selected locations by file afterward.
- A single file could therefore occupy the entire Result cap despite references in other files.
- The collected reference list is available before the cap; changing its selection needs no additional provider request.
- Reference Read-next guidance was derived separately from the old ordered prefix. It now uses the selected Evidence list.

## Approved selection

1. Preserve normalization, deduplication, project containment, target-location exclusion, and separate external/invalid-location accounting.
2. Group the collected project reference locations by file for selection.
3. Visit files in the existing stable file-path order. Within each file, retain line/character order.
4. Select one remaining reference from each file per round until `maxResults` is reached or all collected references are selected.
5. Order the selected references by file, line, and character for presentation.

Selection is based on file distribution, not semantic importance. Do not prioritize target-file proximity, test paths, runtime paths, filenames, or inferred reference usage kinds.

### Limits and completeness

- `maxResults` continues to count reference Evidence atoms, not files or rendered rows.
- With more files than available slots, the first files in stable file-path order receive a slot. The result does not claim complete file coverage.
- When all collected references fit, selected locations and their presentation order remain unchanged.
- For unchanged collected evidence, increasing `maxResults` preserves every previously selected location; only its position in the displayed list may change.
- Exact totals and omission counts retain their existing meaning on complete provider results.
- Apply the same selection to known collected references on partial provider results. Unknown totals, provider limitations, invalid-location disclosures, and known display omissions retain their existing meaning.
- File distribution does not establish complete collection or semantic relevance.

### Example

Each numbered reference below denotes a distinct location in source order.

| Collected references | Limit | Selected references in presentation order |
| --- | --- | --- |
| `a.ts`: 40; `b.ts`: 1; `c.ts`: 1 | 5 | `a1`, `a2`, `a3`, `b1`, `c1` |
| `a.ts`: 2; `b.ts`: 2; `c.ts`: 2 | 4 | `a1`, `a2`, `b1`, `c1` |
| 20 files, at least one reference each | 8 | First reference from each of the first eight files |
| `a.ts`: 40 | 5 | `a1` through `a5` |

## Presentation

- Compute one selected Evidence list before presentation; do not implement different selection policies in renderers.
- Markdown keeps file grouping. Native structured output keeps flat reference items ordered by file and source position.
- TUI consumes the same selected evidence while retaining its existing independent display limit and omission disclosure.
- Add a short selection explanation to existing model-visible result text only when the reference Result cap omits known locations and the collected references span multiple files.
- The explanation must not claim that every file is represented or that selected references are more relevant. Existing counts remain authoritative.
- Do not add a new output section or public field for that explanation.
- Omit the explanation when all collected references fit or only one file has collected references. Existing partial-provider disclosures still apply.

## Read-next guidance

- Derive reference-based suggestions from selected reference locations, not the discarded prefix of the collected list.
- Preserve the Target's own source-reading recommendation.
- Prefer selected reference locations in different files, prioritizing files not already represented by the Target recommendation.
- Consider additional reference ranges in the Target file afterward when recommendation capacity remains. A single-file result may still provide additional source-reading guidance in that file.
- Within these priorities, retain stable file/source order.
- Preserve existing recommendation budgets, cross-relation combination, and overlapping-range merging.
- Keep these suggestions as Read-next guidance, not additional Tool evidence.

Example: with a Target recommendation in `a.ts`, selected references in `a.ts`, `b.ts`, and `c.ts`, and two available reference-recommendation slots, choose reference ranges in `b.ts` and `c.ts`.

## Implementation acceptance cases

| Case | Required behavior |
| --- | --- |
| One file dominates the reference count | Other files receive slots before the dominant file receives additional rounds |
| More files than slots | Stable first-file selection; omissions remain explicit |
| A file runs out of references | Remaining slots go to files with unselected references |
| Only one reference file | Existing source-order selection remains unchanged |
| All references fit, including an empty result | Existing locations, counts, and presentation order remain unchanged; no selection explanation |
| Same evidence with increasing limits | Previously selected locations remain selected |
| Partial provider result | Distribution applies only to collected locations; unknown totals and partial reasons remain intact |
| Different output representations | Same selected Evidence atoms and metadata; existing TUI-only display limits remain independent |
| Target and reference suggestions share a file | Prefer other selected files for reference suggestions; retain single-file guidance when needed |
| Multiple requested relations | Only references change; other relation selection and shared recommendation budgets remain unchanged |

## Vocabulary and source references

Use the existing [Code Intelligence glossary](../../packages/supi-code-intelligence/GLOSSARY.md): Evidence ordering, Evidence atom, Evidence list, Result cap, Tool result assembly, and Read-next guidance. No additional domain term or ADR is required for this reversible selection policy.

- [Evidence-list disclosure policy](../adr/0004-evidence-list-truncation-disclosure.md)
- [Graph result assembly](../../packages/supi-code-intelligence/src/tool/code_graph/result.ts)
- [Reference location normalization and ordering](../../packages/supi-code-intelligence/src/analysis/relations/provider-locations.ts)
- [Graph collection and Target reading guidance](../../packages/supi-code-intelligence/src/session/graph/collect.ts)
- [Graph Read-next combination](../../packages/supi-code-intelligence/src/tool/code_graph/read-next.ts)
- [Graph Markdown grouping](../../packages/supi-code-intelligence/src/tool/code_graph/markdown.ts)
