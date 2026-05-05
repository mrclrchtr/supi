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

**10 points**: No overlap with auto-delivered content. CLAUDE.md focuses on curated, non-obvious context only.

**7 points**: Minor overlap (e.g., a brief package list that adds relationships beyond the auto-generated module graph)

**4 points**: Significant overlap — package tables, architecture overviews, or dependency graphs that duplicate `code_intel` output

**0 points**: Large sections that are purely auto-generated data (module lists with descriptions, dense dependency tables)

**What is NOT overlap:**
- Gotchas specific to a package's behavior
- Cross-package patterns that aren't discoverable from manifests
- Commands and workflows
- Human-curated "Start Here" guidance with reasoning

**What IS overlap:**
- Monorepo package tables where every row is `{name, description, path}`
- Root-level "Modules" or "Packages" sections with >5 entries
- High-level architecture overviews that don't add relationships, gotchas, or conventions beyond what's in `package.json`
- Dependency graphs that could be generated from `pnpm-workspace.yaml`

## Assessment Process

1. Read the CLAUDE.md file completely
2. Cross-reference with actual codebase:
   - Run documented commands (mentally or actually)
   - Check if referenced files exist
   - Verify architecture descriptions
3. Score each criterion
4. Calculate total and assign grade
5. List specific issues found
6. Propose concrete improvements

## Red Flags

- Commands that would fail (wrong paths, missing deps)
- References to deleted files/folders
- Outdated tech versions
- Copy-paste from templates without customization
- Generic advice not specific to the project
- "TODO" items never completed
- Duplicate info across multiple CLAUDE.md files
- Sections that duplicate `code_intel brief` output (package tables, module graphs, dependency lists)
