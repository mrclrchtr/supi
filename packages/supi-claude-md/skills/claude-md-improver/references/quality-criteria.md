# CLAUDE.md Quality Criteria

## Scoring Rubric

### 1. Non-Obvious Commands & Workflows (15 points)

**15 points**: Non-obvious commands and workflow patterns captured with context
- Gotcha commands or required flags documented (e.g. `--unsafe`, `--runInBand`)
- Hook/pre-push behaviors, ordering requirements, or cross-tool workflows captured
- Routine install/build/test/lint commands are NOT counted toward this score

**12 points**: Most non-obvious commands/workflows present, some missing context

**8 points**: Only routine commands listed, no non-obvious patterns

**4 points**: Few or irrelevant commands

**0 points**: No commands or workflows documented

### 2. Architecture Clarity (15 points)

**15 points**: Clear codebase map
- Key directories explained
- Module relationships documented
- Entry points identified
- Data flow described where relevant

**12 points**: Good structure overview, minor gaps

**8 points**: Basic directory listing only

**4 points**: Vague or incomplete

**0 points**: No architecture info

### 3. Non-Obvious Patterns (15 points)

**15 points**: Gotchas and quirks captured
- Known issues documented
- Workarounds explained
- Edge cases noted
- "Why we do it this way" for unusual patterns

**10 points**: Some patterns documented

**5 points**: Minimal pattern documentation

**0 points**: No patterns or gotchas

### 4. Conciseness (15 points)

**Hard cap: no instruction file should exceed 200 lines.** Above 200 lines the score is capped at 5/15 regardless of content quality; above 300 lines the score is 0/15. Every line past 200 must fight for its place against removal.

**15 points**: Every token earns its place — file is ≤200 lines
- No filler, obvious info, or unnecessary content; every token saves more time than it costs to read
- Each line adds value that isn't trivially discoverable elsewhere
- No redundancy with code comments, package.json, or README
- Routine commands already removed or never present

**10 points**: Mostly concise, some padding — file is ≤200 lines

**5 points**: Over 200 lines, or verbose with significant padding

**0 points**: Over 300 lines, or mostly filler / restates obvious code

### 5. Currency (15 points)

**15 points**: Reflects current codebase
- Commands work as documented
- File references accurate
- Tech stack current

**10 points**: Mostly current, minor staleness

**5 points**: Several outdated references

**0 points**: Severely outdated

### 6. Actionability (15 points)

**15 points**: Instructions are executable
- Commands can be copy-pasted
- Steps are concrete
- Paths are real

**10 points**: Mostly actionable

**5 points**: Some vague instructions

**0 points**: Vague or theoretical

### 7. Auto-Delivered Overlap (10 points)

Score this criterion after a **context baseline review**: compare the CLAUDE.md against what a SuPi-enabled PI session likely already has from `code_brief` and other known injected context.

**10 points**: Almost no overlap. Any overlap is tiny and clearly justified by human-only reasoning.

**7 points**: Some overlap, but the file still adds meaningful unique guidance (for example, a partially redundant structure section that keeps ownership rules or a concise "start here" note).

**4 points**: Significant overlap — package tables, root project-structure trees, architecture overviews, or dependency graphs duplicate the baseline context and should be compressed.

**0 points**: Large sections are almost entirely duplicated generated context (module lists with descriptions, dense dependency tables, long root directory trees).

**What is NOT overlap:** Gotchas specific to a package's behavior; cross-package patterns that aren't discoverable from manifests; non-obvious commands and workflows (gotcha flags, hook behaviors, ordering requirements — not routine npm install/test/build); human-curated "Start Here" guidance with reasoning; concise structure notes that explain boundaries, ownership, initialization order, or important exceptions; and sections classified as **unique** during the baseline review.

**What IS overlap:** Monorepo package tables where every row is `{name, description, path}`; root-level "Modules" or "Packages" sections with >5 entries; the **fully redundant** portion of a section during baseline review; root `## Project structure` / `## Architecture` trees that mostly restate folders, packages, or module layout already visible from `code_brief`; high-level architecture overviews that don't add relationships, gotchas, conventions, or exceptions beyond what's in `package.json`; and dependency graphs that could be generated from `pnpm-workspace.yaml`.

## Assessment Process

1. Read the CLAUDE.md file completely.
2. If SuPi is active, perform a **context baseline review** first: compare against `code_brief` and other known injected context, then classify sections as **fully redundant**, **partially redundant**, or **unique**.
3. Cross-reference with the actual codebase: run documented commands (mentally or actually), check that referenced files exist, and verify architecture descriptions.
4. Score each criterion, calculate the total, assign the grade, list the specific issues, and propose concrete improvements.

## Red Flags

Watch for commands that would fail (wrong paths, missing deps), references to deleted files or folders, outdated tech versions, template copy without customization, generic advice, stale `TODO` items, duplicate info across multiple CLAUDE.md files, sections that duplicate `code_brief` output, and structure sections where the redundant tree/inventory portion should be separated from the unique guidance portion.
