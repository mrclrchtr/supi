- [x] **Task 1**: Fix ReDoS (HIGH) in `packages/supi-tree-sitter/src/runtime.ts` — add query string length limit to prevent regex denial of service via user-supplied Tree-sitter query strings
  - File: `packages/supi-tree-sitter/src/runtime.ts`
  - Add `MAX_QUERY_LENGTH` constant and validate query string length before constructing Tree-sitter Query
  - Verification: `pnpm vitest run packages/supi-tree-sitter/` ✓ (151 pass)

- [x] **Task 2**: Fix XSS - Improper URI Scheme Sanitization (MEDIUM) in `packages/supi-web/src/convert.ts` — make `resolveUrl` case-insensitive and block additional dangerous URI schemes (data:, vbscript:)
  - File: `packages/supi-web/src/convert.ts`
  - Change `startsWith("javascript:")` to case-insensitive check for javascript:, data:, vbscript:
  - Verification: `pnpm vitest run packages/supi-web/`

- [x] **Task 3**: Fix Path Traversal (LOW) in `scripts/publish.mjs` and `scripts/pack-staged.mjs` — validate the packageDir argument to prevent directory traversal
  - Files: `scripts/publish.mjs`, `scripts/pack-staged.mjs`
  - Add path validation to ensure `packageDir` is within the workspace/repo bounds (resolve and check against project root)
  - Verification: `node scripts/publish.mjs --help 2>&1 | head -5`

- [x] **Task 4**: Fix Path Traversal (LOW) in `.agents/skills/skill-creator/scripts/*.py` — validate user-supplied paths in Python skill scripts
  - Files: `.agents/skills/skill-creator/scripts/package_skill.py`, `run_loop.py`, `generate_report.py`, `aggregate_benchmark.py`, `improve_description.py`, `run_eval.py`, `quick_validate.py`
  - Add path validation using `os.path.abspath` and check for `..` traversal attempts
  - Verification: `python3 -c "import py_compile; py_compile.compile('.agents/skills/skill-creator/scripts/package_skill.py', doraise=True)"`