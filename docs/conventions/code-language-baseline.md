# Code language capability baseline

Status: implementation and acceptance suite present; full pinned Linux/macOS qualification pending.

This specification defines the first common Language capability baseline for Code Intelligence. The implementation includes structural evidence, C-family associations, and safe rename compatibility. The acceptance suite and CI gate are present, but this document does not establish that both pinned platform jobs have passed.

## Scope

| Decision | Requirement |
| --- | --- |
| Language families | TypeScript/JavaScript, Python, Java, Go, Rust, and C/C++ |
| Goal | Common read-only code understanding plus safe semantic rename |
| Server installation | Users install language servers; no runtime server installer |
| Target creation | Retain LSP-first target creation and refinement |
| Platforms | Required live acceptance tests on Linux and macOS |
| Qualification | Applicable required operations must pass; no undocumented exceptions |
| Existing languages | Preserve existing behavior outside the selected group; do not claim the new baseline for those languages |
| Documentation | Update support claims only from implemented behavior and passing verification cases |

JavaScript and TypeScript require separate evidence. C and C++ also require separate evidence. A shared server or grammar family does not make one language's test sufficient for another.

## Terms and evidence

Use the terms in [the Code Intelligence glossary](../../packages/supi-code-intelligence/GLOSSARY.md):

- Language capability baseline.
- Language verification case.
- Structural import evidence.
- Native declaration kind.
- C-family file association.

Keep these claims separate:

| Claim | What it establishes | What it does not establish |
| --- | --- | --- |
| Configured route | A file can select a configured server command | Installation, readiness, or operation support |
| Parser availability | A grammar can be selected for a source file | Complete parsing or support for every extractor |
| Implemented structural operation | An extractor supports specified source forms | Semantic identity or runtime behavior |
| Passing verification case | Expected behavior for the tested language, source form, provider/toolchain version, and operating system | Every server, version, dialect, or project configuration |
| Live operation result | Evidence at the requested scope, with its completeness and freshness limits | Whole-workspace correctness or universal language compatibility |

Use `not applicable` only when the operation has no defined meaning for the specified language or source form. A missing provider capability, missing extractor, skipped test, or unverified source form is not `not applicable`.

## Required operations

| Area | Required behavior |
| --- | --- |
| Point inspection | Syntax and enclosing named declaration evidence; semantic hover, definitions, and nearby diagnostics when the required server is ready |
| Declaration search | Named declarations and members at all nesting levels |
| Import search | Written source specifiers and locations for the forms below |
| Call search | Written call-site evidence, with each distinct site retained |
| Structural callees | Direct and deep enclosing-scope queries under the existing target contract |
| Semantic discovery | Document and workspace symbols, including the public resolution and semantic-search workflows |
| Semantic navigation | Hover, definitions, references, and implementation relations where meaningful |
| Diagnostics | Known-error reporting, updates after edits, and truthful freshness and confirmation limits |
| Rename | Real semantic rename through separate plan and apply operations |

Preserve the existing public tool names and AST query kinds. This work does not add language-native query parameters or a new public tool.

### Declaration categories

- Include nested named functions, types, and members. A named declaration does not become ineligible because it is inside another function.
- Do not turn the extractor into a complete index of local variables, parameters, destructuring, or anonymous expressions.
- Preserve existing supported declaration forms outside the expanded nested-declaration scope.
- Retain Native declaration kind in structural results.
- Keep common search categories separate from native syntax, Provider-reported symbol kind, and Canonical declaration identity kind.
- Define and test each common-category mapping. For example, `type` includes Go structs and Java records; Rust traits can match `interface` and `type` while remaining traits in the returned evidence.
- Do not infer a structural category from a library convention. A Python class is not a native interface or enum merely because a base expression has a familiar name.
- Preserve the current semantic symbol-kind filtering contract. Structural search categories do not change LSP filters or target identity.

### Import source forms

Import search matches source specifiers, not a separate imported-name or local-alias index. It does not resolve files, packages, bindings, or installed dependencies.

| Language | Included forms | Source-target rules |
| --- | --- | --- |
| TypeScript/JavaScript | Declarative imports | Preserve existing import behavior and source specifiers |
| Python | `import` and `from` declarations | Preserve written module targets and relative prefixes; aliases are not separate search targets |
| Java | Ordinary and static imports | Preserve the written import target, including wildcard forms |
| Go | Single and grouped imports | One written import path per item; aliases do not replace the path |
| Rust | `use`, `extern crate`, and external `mod` declarations | Derive grouped `use` targets only from explicit syntax; retain evidence locations; do not infer file paths |
| C/C++ | Literal quoted and angle-bracket include directives | Preserve the literal target and its source location; do not expand macros or resolve headers |

Additional rules:

- An inline Rust module body is a declaration, not an external source import.
- Reconstructed Rust paths must use only syntax present in the declaration. Alias names are not substitute dependency targets.
- Include written dependency directives inside conditional branches without claiming that they are active dependencies.
- Keep imports separate from export discovery. A declaration can provide import evidence without establishing a cross-language export model.
- Do not add `require("pkg")`, `import("pkg")`, computed loader calls, or CommonJS assignments to this baseline.
- Do not add C++20 module-import extraction or macro-generated include targets.
- State these source-form limits in support documentation. A language row must not imply that all dependency syntax is covered.

### Call evidence

- Retain each distinct source call site, including repeated calls with the same name on one line.
- Use source ranges and coordinates to distinguish sites. Display grouping must not change evidence counts.
- Keep call-site search separate from anchored structural callee analysis.
- Preserve direct/deep scope semantics: deep includes nested scopes, not transitive calls.
- Keep Rust macro invocations as written syntax evidence, not expanded function calls.
- Do not treat JSX component tags as function-call expressions.
- Do not expand preprocessors, macros, or generated code to create structural evidence.
- Do not claim symbol identity from written call syntax.

### Incomplete source

Return usable recovered syntax as partial evidence when recovery can hide relevant evidence.

- Report the affected file and available syntax-error locations.
- Preserve collected evidence that can still be reported accurately.
- Do not report complete absence from an affected structural search.
- Keep point inspection local, but disclose recovery that affects its evidence.
- Propagate completeness through the parser, provider, workflow, and result-assembly interfaces. Markdown and structured details must agree.
- Unsupported source forms must not become verified operation support merely because the parser produced a tree.
- Retain existing limits, cancellation behavior, and omission disclosures. Do not use syntax recovery as a reason to remove valid collected evidence without explanation.

### Operation without LSP

- AST search and point syntax inspection can operate without a language server.
- New targets and target groups still require semantic readiness.
- Target-based structural callees retain the existing LSP-first target rule.
- Existing fresh targets retain their current structural-consumer behavior after semantic-provider loss.
- Semantic operations and rename require the relevant live server capability.
- Do not add structural-only target creation or text-based semantic substitutes.

## C-family file associations

Add an ordered setting in trusted project configuration:

```json
{
  "code-intelligence": {
    "fileAssociations": [
      { "pattern": "vendor/**/*.h", "language": "c" },
      { "pattern": "**/*.h", "language": "cpp" }
    ]
  }
}
```

Required behavior:

1. Patterns select project-relative source paths.
2. The first matching rule supplies the language. Put specific rules before general rules.
3. With no match, retain the existing extension mapping, including C for `.h`.
4. Accept only `c` and `cpp` in this first implementation.
5. Apply associations only to existing C-family source and header suffixes. They do not make arbitrary new suffixes eligible.
6. Apply the same language choice to AST grammar selection and the LSP document language ID.
7. Preserve the selected server route. An association is not a command override or compiler configuration.
8. Reject invalid configuration rather than silently ignore it.
9. Keep associations project-only in this baseline. Do not introduce global association precedence.
10. Do not bypass project trust, exclusions, request scope, or other existing eligibility rules.

Patterns are case-sensitive globs over `/`-separated paths; `*`, `?`, `**`, character classes, and brace alternatives are supported. Rules cannot expand suffix eligibility, even when a pattern matches another file type. Limit configuration to 64 rules and 512 characters per pattern. The workspace host retains its immutable snapshot until its last lease is released; restart or release shared sessions before reloading changed rules.

Do not guess the language from source keywords, retry another grammar silently, or inspect build metadata to choose between C and C++ in this work.

## Semantic qualification

Use the following reference commands. Python qualification uses an explicit Basedpyright configuration; the default Python route remains Pyright.

| Language | Reference command |
| --- | --- |
| TypeScript/JavaScript | Project-local native TypeScript `tsc --lsp --stdio`; explicit TS6 control through `typescript-language-server` |
| Python | `basedpyright-langserver` through an explicit `lsp.servers.python` override |
| Java | `jdtls` |
| Go | `gopls` |
| Rust | `rust-analyzer` |
| C/C++ | `clangd` |

Pin server and toolchain versions in the acceptance setup. Record the tested combinations; do not imply support for every user-installed version.

The initial live audit found that Pyright did not advertise implementation lookup and rejected `textDocument/implementation` with JSON-RPC error `-32601`. The user selected Basedpyright for explicit qualification, not as a new default. Keep the default Pyright capability gap visible in the README and preserve existing user configurations. Basedpyright settings use its own configuration namespace; do not silently translate Pyright settings.

Start with a capability audit. If a reference server cannot provide a required operation that has a valid meaning in that language:

- Do not claim that the language passes the full baseline.
- Do not weaken positive tests to accept unavailable or empty responses.
- Do not convert the gap to `not applicable` or a skipped success.
- Investigate an adapter or reference-server change.
- Obtain a new scope or server decision if the requirement cannot be met safely.

Valid empty results require tests, but they do not replace positive operation tests.

### Diagnostics

- Test a known error and a subsequent fix with each reference server.
- Assert the reported observation, freshness, and confirmation state, not only the diagnostic count.
- A server may report useful errors without being able to confirm fresh absence after a fix. Preserve that distinction.
- An empty snapshot must not establish that a file or workspace is clean without the required confirmation evidence.
- Preserve the existing separation between diagnostic result scope, maintenance scope, and workspace-wide server inventory.
- Universal request-confirmed clean-file evidence is not a requirement of this baseline.

### Rename

For each selected language, verify the public plan/apply workflow with a real reference server:

- Planning leaves source files unchanged.
- The plan contains the expected semantic edits and scope.
- Apply changes the intended occurrences and preserves unrelated source text.
- Cross-file edits are covered where the fixture has cross-file references.
- Changed source invalidates a stored plan and requires a new plan.
- Existing range, overlap, authority, document-version, mutation-queue, and rollback checks remain in force.
- Missing rename capability does not trigger a textual replacement fallback.
- When a server returns unknown numeric versions or null versions for open files, a first response can identify files for one bounded same-route enrollment and fresh request. Validate canonical authority before enrollment and limit the set to 64 files.
- Numeric versions remain mandatory when supplied. Verified request snapshots remain content preconditions for numeric-version edits too. A null version for an open document requires an authoritative synchronized-content snapshot; retain the client version and SHA-256 fingerprint as preconditions and reject changed content before storing or applying the plan.
- The follow-up response cannot expand beyond the verified file set. An old edit response, missing snapshot, or changed input cannot become a plan.

Import updates, dead-code removal, function extraction, and variable extraction remain outside the new baseline. Preserve their existing safety and availability behavior.

## Acceptance tests

Required CI must provision and run the reference combinations on Linux and macOS. Missing required prerequisites are failures, not skipped passes.

Use three complementary test surfaces:

| Test surface | Purpose |
| --- | --- |
| Real parser fixtures | Verify syntax forms, extraction, native categories, locations, and partial evidence |
| Deterministic protocol and workflow fixtures | Verify unavailable states, invalid input, cancellation, limits, stale plans, and safety failures |
| Public tool workflows with real language servers | Verify actual language operations and end-to-end result contracts |

Mocks and local protocol fixture servers do not qualify external language-server support. Parser tests do not qualify semantic support.

Required corpus and checks:

- Separate JavaScript, TypeScript, C, and C++ cases; relevant JSX/TSX and other supported source variants.
- Native project setup needed by each server, including module/build configuration and compilation information where required.
- Positive declarations, imports, calls, symbols, navigation, diagnostics, and rename results.
- Nested named declarations and common-category/native-kind distinctions.
- Distinct same-line call sites and direct/deep scope behavior.
- Grouped, relative, wildcard, static, and aliased import forms where the declared source-form contract includes them.
- C/C++ header associations, first-match exceptions, no-match defaults, and invalid configuration.
- Incomplete syntax and unsupported source-form limits.
- Valid empty observations, unavailable providers, and explicit partial results.
- Source-coordinate correctness, including existing UTF-16 conventions.
- Matching evidence and completeness in agent output and structured details.
- Existing tests for languages outside the selected group remain passing.

Use the repository's normal verification command, `pnpm verify:ai`, for implementation changes. The required live matrix supplements that check; it must not be replaced by a local run that skips absent servers.

## Implementation order and ownership

1. Establish reference-server capability evidence and the required acceptance matrix before making baseline claims.
2. Add consistent C-family language selection and structural completeness reporting.
3. Extend native declaration and import extraction, call-site identity, and public workflow tests.
4. Complete Linux/macOS qualification and update the support documentation from verified results.

Retain the [code runtime ownership split](code-runtime-architecture.md):

- `supi-tree-sitter`: parsing, structural extraction, parser recovery, and source evidence.
- `supi-lsp`: server routing, semantic document identification, capabilities, diagnostics, and semantic refactors.
- `supi-code-runtime`: shared provider contracts and evidence types.
- `supi-code-intelligence`: workflow policy, target rules, public tools, and result assembly.

Keep one consistent association decision across the structural and semantic paths. Do not put language-specific extraction logic in tool adapters or renderers. Preserve Structural Worker isolation and path-based provider interfaces unless implementation evidence requires a separately reviewed change.

## Documentation and completion

The implementation is complete only when:

- [ ] Every selected language passes its applicable required verification cases on Linux and macOS.
- [x] Required CI cannot silently skip missing reference prerequisites.
- [ ] The public workflow tests establish the claimed semantic behavior, including rename.
- [ ] Structural evidence preserves native kinds, source locations, and completeness.
- [x] C-family associations are validated, documented, and consistent across both providers.
- [x] Support tables distinguish routes, structural operations, source-form limits, and reference server combinations; qualification remains explicit.
- [ ] The Code Intelligence, LSP, and Tree-sitter documentation agrees with the registries and tests.
- [ ] Existing behavior outside the new baseline has no regressions.

Do not update the README to present this design as delivered support before these conditions pass.

## Excluded work and follow-ups

- New language families, including C# and PHP.
- Managed language-server installation.
- Structural-only target creation.
- A complete local-binding index.
- Common export or public-interface discovery.
- Runtime loader-call dependency discovery and CommonJS assignments.
- C++20 module-import extraction and compiler-expanded structural evidence.
- General language associations, arbitrary new suffixes, or global associations.
- Advanced semantic refactors beyond rename.
- Windows live qualification; do not deliberately break existing Windows behavior.
- New workspace metadata readers.

Workspace metadata readers are tracked in [GitHub issue #509](https://github.com/mrclrchtr/supi/issues/509). Maven, Gradle, and CMake are candidates for that separate design. Generic workspace inventories remain available without those readers.

## Source references

- [Code Intelligence README](../../packages/supi-code-intelligence/README.md).
- [LSP README](../../packages/supi-lsp/README.md) and [default routes](../../packages/supi-lsp/src/config/defaults.json).
- [LSP document language mapping](../../packages/supi-lsp/src/utils.ts).
- [Tree-sitter README](../../packages/supi-tree-sitter/README.md), [grammar selection](../../packages/supi-tree-sitter/src/language.ts), and [operation registry](../../packages/supi-tree-sitter/src/operation-support.ts).
- [AST search-kind mapping](../../packages/supi-code-intelligence/src/analysis/search/pattern.ts) and [structural matching](../../packages/supi-code-intelligence/src/analysis/search/pattern-analysis.ts).
- [Provider contracts](../../packages/supi-code-runtime/src/capability/types.ts) and [query-result states](../../packages/supi-code-runtime/src/query-result.ts).
- [Bounded workspace observations](../../packages/supi-code-intelligence/docs/adr/0003-bounded-workspace-orientation.md).
