# CLAUDE.md Quality Criteria

## Scoring Rubric

### 1. Commands/Workflows (15 points)

**15 points**: All essential commands documented with context
- Build, test, lint, deploy commands present
- Development workflow clear
- Common operations documented

**12 points**: Most commands present, some missing context

**8 points**: Basic commands only, no workflow

**4 points**: Few commands, many missing

**0 points**: No commands documented

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

**15 points**: Dense, valuable content
- No filler or obvious info
- Each line adds value
- No redundancy with code comments

**10 points**: Mostly concise, some padding

**5 points**: Verbose in places

**0 points**: Mostly filler or restates obvious code

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

Score this criterion after a **context baseline review**: compare the CLAUDE.md against what a SuPi-enabled PI session likely already has from `code_intel brief` and other known injected context.

**10 points**: Almost no overlap. Any overlap is tiny and clearly justified by human-only reasoning.

**7 points**: Some overlap, but the file still adds meaningful unique guidance (for example, a partially redundant structure section that keeps ownership rules or a concise "start here" note).

**4 points**: Significant overlap — package tables, root project-structure trees, architecture overviews, or dependency graphs duplicate the baseline context and should be compressed.

**0 points**: Large sections are almost entirely duplicated generated context (module lists with descriptions, dense dependency tables, long root directory trees).

**What is NOT overlap:** Gotchas specific to a package's behavior; cross-package patterns that aren't discoverable from manifests; commands and workflows; human-curated "Start Here" guidance with reasoning; concise structure notes that explain boundaries, ownership, initialization order, or important exceptions; and sections classified as **unique** during the baseline review.

**What IS overlap:** Monorepo package tables where every row is `{name, description, path}`; root-level "Modules" or "Packages" sections with >5 entries; the **fully redundant** portion of a section during baseline review; root `## Project structure` / `## Architecture` trees that mostly restate folders, packages, or module layout already visible from `code_intel brief`; high-level architecture overviews that don't add relationships, gotchas, conventions, or exceptions beyond what's in `package.json`; and dependency graphs that could be generated from `pnpm-workspace.yaml`.

## Assessment Process

1. Read the CLAUDE.md file completely.
2. If SuPi is active, perform a **context baseline review** first: compare against `code_intel brief` and other known injected context, then classify sections as **fully redundant**, **partially redundant**, or **unique**.
3. Cross-reference with the actual codebase: run documented commands (mentally or actually), check that referenced files exist, and verify architecture descriptions.
4. Score each criterion, calculate the total, assign the grade, list the specific issues, and propose concrete improvements.

## Red Flags

Watch for commands that would fail (wrong paths, missing deps), references to deleted files or folders, outdated tech versions, template copy without customization, generic advice, stale `TODO` items, duplicate info across multiple CLAUDE.md files, sections that duplicate `code_intel brief` output, and structure sections where the redundant tree/inventory portion should be separated from the unique guidance portion.
