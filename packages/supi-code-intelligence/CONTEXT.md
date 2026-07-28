# supi-code-intelligence

Agent-facing capabilities for code understanding, navigation, search, and refactor in PI. Depends on `supi-code-runtime` for shared workspace context and types.

See also: root `CONTEXT.md` for project-wide terms (Context Efficiency, Prompt Surface Compression, etc.) and `packages/supi-code-runtime/CONTEXT.md`.

## Language

**Code intelligence**:
The set of agent-facing capabilities that help understand, navigate, search, and refactor code.
_Avoid_: code intel, IDE features

**Orientation surface**:
The code-intelligence surface that helps an agent establish where it is, what seams and landmarks matter, and what source it should inspect next before choosing more surgical tools.
_Avoid_: context bundle, relation graph, treating orientation as target analysis

**Orientation focus**:
The project, package, directory, file, or symbol that an orientation surface is centered on. An absent focus means workspace-level orientation; a precise focus means symbol-centered orientation rather than relation analysis.
_Avoid_: scope, path, target when referring to orientation selection

**Priority signal**:
A bounded, focus-relevant fact included in Orientation to help choose what source to inspect next. It is prioritization context, not a full health report.
_Avoid_: health section, diagnostic report, priority warning

**Workspace code-intelligence session**:
The workspace-scoped Code intelligence context that owns workflow policy, capability readiness, and ephemeral target and refactor handles for one PI session. It yields typed workflow outcomes without owning Tool result assembly or presentation.
_Avoid_: provider bag, renderer, global code-intelligence state

**Target workflow**:
The code-intelligence flow that turns one exact target selector — a handle, anchored coordinate, symbol query, or permitted file reference — into evidence-backed target facts before graph, Orientation, or refactor analysis begins. Target workflow decisions preserve selector exactness and honest correctness before downstream analysis runs.
_Avoid_: ad-hoc target expansion, mutating search params, treating scope as a target

**Resolved target**:
The immutable output of a target workflow: the evidence-backed file, anchor, symbol identity, confidence, provenance, and notes a downstream code-intelligence tool may rely on. A resolved target is not a public parameter bag and should not be changed by downstream tools.
_Avoid_: expanded params, anonymous point target, mutable target

**Target refinement**:
The evidence-preserving reconciliation of repeated observations that share one Canonical declaration identity. Identity remains stable while display kind, anchor quality, confidence, and Target provider provenance are refined independently.
_Avoid_: whole-record replacement, latest observation wins, first observation wins

**Target provider provenance**:
The monotonic set of provider families—semantic and structural—that established a target declaration. It records corroborating evidence, not selector or workflow origin; anchored resolution path belongs to resolution metadata.
_Avoid_: strongest source, symbol-query provenance, resolution reason

**Target group**:
A bounded public collection derived from all evidence-backed declarations discovered within one file when no single symbol was selected, including nested declarations. Discovery retains exact total/omitted completeness, but only visible members are materialized as handles. Provider-proven top-level declarations are presented first; every other declaration remains source-ordered. The group is not itself a Resolved target; downstream precise intents select one member.
_Avoid_: file handle, synthetic target, unbounded handle batch, treating a file coordinate as a symbol

**Declaration nesting evidence**:
A document-declaration fact with exactly three states: `top-level`, `nested`, or `unknown`. Hierarchical LSP document symbols and structural outline ancestry establish known states. Every flat LSP `SymbolInformation` observation remains `unknown`; `containerName` is retained only as container metadata and never establishes nesting. Equivalent provider observations reconcile nesting before presentation ranking, and a Target group discloses the exact unknown count.
_Avoid_: nullable container inference, capitalization heuristics, kind-based hierarchy, source-order fallback

**Target group discovery provenance**:
The provider families that successfully enumerated a selected file, including successful empty observations. It describes the group discovery attempt, not the evidence establishing each member.
_Avoid_: member provenance, group confidence, provider availability

**Target group confidence**:
A conservative summary of member confidence: semantic only when every member is semantic, and structural when any member is structural-only. For an empty group, it reflects the strongest successful enumerator.
_Avoid_: strongest member confidence, provider availability, mixed provenance

**Canonical declaration identity kind**:
The provider-independent declaration family used only for cross-provider matching and Target-handle identity. It normally normalizes the Provider-reported symbol kind; when that kind cannot express the source construct, exact structural evidence at the declaration's Name anchor may refine it. For example, a TypeScript LSP `Variable` at a Tree-sitter `type_alias_declaration` retains `Variable` for display but uses `type` for identity. This is declaration-specific and does not merge separate type/value namespace declarations.
_Avoid_: display kind, blanket type-to-value normalization, name-only equivalence, syntax guessing

**Target display kind**:
The declaration category shown for a Target. Repeated observations select the strongest available non-null value—semantic before structural—preserve the established value on equal-strength ties, and keep it independent of Canonical declaration identity kind.
_Avoid_: identity kind, latest observation wins, missing classification erasing known evidence

**Declaration occurrence identity**:
The provider-independent identity of one declaration within a file: Canonical declaration identity kind, symbolic container, declaration line, and deterministic occurrence among otherwise identical declarations on that line. It distinguishes overloads and type/value namespace declarations while remaining stable when semantic evidence replaces structural evidence or a declaration anchor refines to a Name anchor.
_Avoid_: display position identity, raw provider kind, treating all same-name declarations as one target

**Provider-reported symbol kind**:
The declaration category supplied by the active semantic provider during symbol discovery. It may not map one-to-one to source-language constructs such as type aliases and is not a canonical syntax classification.
_Avoid_: source declaration kind, canonical kind, syntax kind

**Symbol-kind mismatch**:
A valid target-selection outcome where a semantic symbol query reports candidates but none has the requested Provider-reported symbol kind. Near-match candidates remain explicit evidence rather than being silently promoted to a Resolved target.
_Avoid_: symbol not found, invalid input, disambiguation, silent fallback

**LSP-first target resolution**:
The rule that ready semantic capability is required when a Resolved target or Target group is established or refined. A fresh stored target may still support structural consumers, while semantic consumers require live semantic readiness.
_Avoid_: structural-only target creation, treating a structural identifier as semantic identity

**Server status evidence**:
Runtime facts about LSP state and server inventory. A live runtime owner or explicit disabled state can establish complete inventory status; pending, inactive, or unavailable state cannot establish an empty inventory. Complete inventory may report disabled capability or zero servers and does not imply semantic code evidence.
_Avoid_: semantic evidence, treating unknown inventory as empty, treating disabled as unknown, inferring capability from runtime presence

**Semantic health state**:
The authoritative final readiness classification—ready, pending, inactive, disabled, or unavailable—for semantic diagnostics at the requested scope, determined after routing and requested recovery. A concrete ready project or file server establishes readiness even if capability publication lags; server inventory remains a separate fact.
_Avoid_: runtime availability, capability publication status, configured-route availability, vacuous readiness, optimistic diagnostics

**Capability Warning**:
An actionable notice that Code intelligence capability is reduced or configured through obsolete settings. It concerns the ability to produce code evidence, not software test coverage.
_Avoid_: degraded coverage, coverage warning

**Live health observation**:
Tool evidence obtained by querying an available source during a `code_health` call. A continuously maintained source may expose its current snapshot with freshness limitations disclosed; a batch source must collect during the call, so a precomputed report is not a Live health observation.
_Avoid_: live/runtime-backed signal, ambient report evidence, undisclosed cached evidence

**Honest correctness**:
The code-intelligence result standard that a tool must either report evidence-backed facts or explicitly say why it cannot. Source limitations stay explicit; heuristic and convention-based inferences are guidance chrome, not Tool evidence. Silent guessing, truncation, scope widening, and fallback to a weaker substrate are incorrect even when they look helpful.
_Avoid_: best-effort correctness, "probably right", inferred facts, treating a convention as evidence, hiding degraded evidence

**Truncation disclosure**:
The honest-correctness invariant that a partial result must say it is partial. When a tool omits matching evidence because of a result cap, the user and agent must be able to distinguish "there are no more results" from "more results exist but were not shown".
_Avoid_: silent truncation, hidden caps, treating capped output as complete evidence

**Invalid provider location**:
A semantic-provider location whose URI, path, or position cannot be converted into a canonical source location. It is counted and disclosed as partial evidence, but establishes neither project nor external evidence.
_Avoid_: external location, silently dropped location, guessed source location

**Tool evidence**:
The facts in a public code-intelligence result that a user or agent may rely on to make a coding decision, such as matched targets, references, diagnostics, structural declarations, imports, exports, callees, implementations, source-file listings, manifest dependency facts, or planned refactor edits. Decorative summaries, next-step hints, and UI-only chrome are not Tool evidence.
_Avoid_: treating every rendered list as evidence, convention-derived relationships, hiding evidence limits in presentation details

**Tool result assembly**:
The code-intelligence flow that turns collected facts into public result evidence: typed result sections, evidence lists, omission metadata, confidence, read-next guidance, and details data. Tool result assembly stops before presentation; markdown and TUI rendering are adapters over the assembled evidence.
_Avoid_: markdown-first result building, generic result builder, mixing evidence collection with rendering

**Evidence list**:
A bounded collection of tool evidence with explicit completeness metadata: which evidence atoms are shown and whether the list is complete. Normal public-tool paths compute exact totals and omitted counts. Unknown totals are reserved for exceptional interruption or provider-limited results, such as timeout, safety-limit, interrupted enumeration, or an upstream provider that cannot expose a true total, and must carry an explicit partial reason instead of pretending exact completeness. Rejected provider locations are tracked separately: valid normalized evidence retains exact counts while `invalidLocationCount` and an explicit partial reason disclose unusable provider atoms. Markdown and structured details should describe the same evidence list rather than computing truncation separately.
_Avoid_: raw capped arrays, renderer-only omission math, details-only omission math, inventing exact totals, using unknown totals as a routine performance shortcut

**Actionable list**:
A bounded list of generated executable or check actions a user or agent may run, such as verification commands. Actionable lists are not tool evidence, but they follow the same truncation-disclosure rule because omitting actions silently can mislead follow-up work. Prose navigation hints such as `nextQueries` are guidance chrome, not actionable lists.
_Avoid_: silently capped command lists, treating generated actions as evidence facts, treating all hints as actions

**Read-next guidance**:
A guidance-chrome section in public code-intelligence markdown that points a user or agent to exact source ranges worth inspecting after a summarized result. It is not tool evidence and does not replace reading the source before editing.
_Avoid_: treating read suggestions as evidence, treating read suggestions as verification commands, hiding source inspection behind summaries

**Next-query guidance**:
Guidance chrome that proposes a follow-up Tool call. It must be executable from evidence and capabilities established by the current result or explicitly name the unmet prerequisite; it does not establish Tool evidence itself.
_Avoid_: unconditional follow-up, implicit capability claim, known-failing call

**Evidence atom**:
One fact that can independently support a coding decision. Evidence-list totals and omitted counts are expressed in evidence atoms, not rendered rows or grouping containers. For example, reference locations count as references even when displayed under grouped file headings, and individual diagnostic messages count as diagnostics even when grouped by file.
_Avoid_: counting visual rows as facts, treating file groups as references

**Result cap**:
A display limit for public tool evidence, not a normal-path enumeration limit. A capped result may show fewer evidence atoms than exist, but it must still disclose the exact total and omitted count unless exceptional interruption prevents exact counting. For Target groups, enumeration completes before the cap and only visible declarations are materialized as handles.
_Avoid_: treating `maxResults` as permission to stop counting evidence, registering hidden handles, silent early-stop search

**Evidence ordering**:
The rule for choosing which evidence atoms are shown when a result cap applies. Domain-specific ranking is preserved when it is meaningful, such as semantic/search relevance; otherwise evidence atoms are ordered deterministically by stable facts such as file, line, or name.
_Avoid_: accidental provider order, random truncation, sorting away meaningful relevance

**Semantic analysis**:
Code understanding based on symbol identity and relationships, such as definitions, references, implementations, and renames.
_Avoid_: structural analysis, syntax-only analysis

**Structural analysis**:
Code understanding based on source shape and syntax, such as imports, exports, outlines, and call-like structure, without requiring symbol identity.
_Avoid_: semantic analysis, symbol-aware analysis

**Structural callee**:
A syntax-derived outgoing-call evidence atom from the enclosing executable scope at a target anchor. Structural callees name the call expression as written; they are not symbol-identity evidence. Calls inside nested functions, methods, or callbacks are not attributed to the outer scope.
_Avoid_: semantic callee, caller, reference, treating nested callback calls as direct parent calls

**Refactor plan**:
A stored, fingerprinted description of a proposed code refactor — its target, operation (e.g. rename or extract), and the exact text edits — produced for inspection and applied later, never silently. Non-mutating by construction.
_Avoid_: "refactor action", "code action result" (those are advisory, not stored plans)

**Plan-then-apply (planner/applier split)**:
The invariant that composing a refactor and mutating files are done by separate concerns: the proposer only composes a plan (returning a plan handle), and mutation is an explicit, revalidating second step against that handle. Producers of plans never mutate; mutators never compose.
_Avoid_: "auto-apply", "preview-and-apply in one call" (these collapse the split into one mutating step)

**Scope**:
A workspace-relative path filter inside a symbol selector or a member of `code_find`'s scope set. Scope narrows discovery; it is not a target, an Orientation focus, or a search pattern. Every scope path must resolve independently, and invalid input is a hard error rather than a silent workspace-wide search.
_Avoid_: `searchPath`, treating scope as a target, precedence between scope and a precise target, silent scope widening

**Scope set**:
A `code_find` scope value containing more than one workspace-relative search root. Each member must resolve independently; duplicate or nested members may produce overlapping provider evidence, so public results deduplicate identical evidence atoms.
_Avoid_: treating a space-separated search pattern as scope, silently ignoring missing members, widening to the whole workspace when one member is invalid

**AST Scan universe**:
The declared set of source files eligible for one structural `code_find` request. Eligibility depends on the selected AST kind's structural operation, not parser availability alone. Policy exclusions—including languages unsupported by that operation—define the universe; runtime limitations make its observation incomplete. Match completeness and file-scan completeness are distinct, and omitted files are not omitted Evidence atoms.
_Avoid_: implicit ignore universe, equating parseable with operation-supported, treating excluded files as searched, counting unprocessed files as omitted matches

**Name anchor**:
The source position of a symbol's identifier token — the offset position-strict substrates (tree-sitter `calleesAt`, hover-at, rename) must resolve against. Best-effort on `CodeSymbol`: present when the provider can derive it (LSP `DocumentSymbol.selectionRange`, or a tree-sitter identifier-snap fallback), absent when neither is available. Distinct from `Declaration anchor`.
_Avoid_: "the symbol's start", "selectionRange part", conflating with declaration anchor

**Declaration anchor**:
The source position of the defining node's start, including `export`/modifier keywords — what LSP `SymbolInformation.location.range.start` gives. Always available; safe for position-tolerant queries (`references`), wrong for position-strict substrates (`callees`, `rename`). Distinct from `Name anchor`.
_Avoid_: "the symbol's start", "location start", conflating with name anchor

**Dual-surface rendering**:
The rule that a tool's TUI rendering builds its chrome (headers, badges, counts) and body (main content) from the structured `details` object, never by parsing the markdown `content` string. The markdown string serves only as the LLM-facing output and as an optional collapsible detail view in the TUI. Chrome and body are independent consumers of the same underlying tool evidence.
_Avoid_: parsing markdown in TUI renderers, using the Markdown widget as the primary TUI body, duplicating evidence between content and details

**TUI chrome**:
The non-body decorative and status elements of a dual-surface tool result: the compact call line in `renderCall`, and in `renderResult` the header badges, count summaries, evidence disclosures, and section toggles. Chrome is built from `details` data, never from markdown parsing.
_Avoid_: building chrome from markdown, embedding chrome in the markdown content string

**TUI body**:
The main content of a dual-surface tool result in `renderResult`: per-section structured widgets built from `details` data. The markdown `content` string is available as an optional collapsible detail view within the body, not as the primary body itself.
_Avoid_: using the Markdown widget as the primary body, treating the markdown string as the user-facing result
