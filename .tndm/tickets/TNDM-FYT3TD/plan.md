## Implementation Plan: `supi-web` Extension

- [x] **Task 1**: Scaffold package `packages/supi-web/` with `package.json`, `tsconfig.json`, `__tests__/tsconfig.json`
  - File: `packages/supi-web/package.json`
  - File: `packages/supi-web/tsconfig.json`
  - File: `packages/supi-web/__tests__/tsconfig.json`
  - Verification: `pnpm install` succeeds and workspace links resolve

- [x] **Task 2**: Implement core fetch + convert modules
  - File: `packages/supi-web/src/fetch.ts` — URL validation, HEAD negotiation, Range GET sniffing, sibling .md probing, full GET with timeout
  - File: `packages/supi-web/src/convert.ts` — HTML→Markdown via JSDOM + Readability + Turndown, link absolutization, content cleanup
  - Verification: `pnpm exec tsc --noEmit -p packages/supi-web/tsconfig.json` passes

- [x] **Task 3**: Implement extension factory and tool registration
  - File: `packages/supi-web/src/web.ts` — `pi.registerTool({ name: "web_fetch_md" })` with TypeBox schema, execute handler, output mode dispatch
  - File: `packages/supi-web/src/index.ts` — public exports
  - Verification: `pnpm exec tsc --noEmit -p packages/supi-web/tsconfig.json` passes

- [x] **Task 4**: Add tests
  - File: `packages/supi-web/__tests__/fetch.test.ts` — URL validation, content negotiation mocks
  - File: `packages/supi-web/__tests__/convert.test.ts` — HTML→Markdown conversion, link absolutization
  - File: `packages/supi-web/__tests__/web.test.ts` — tool param validation, output mode logic
  - Verification: `pnpm vitest run packages/supi-web/`

- [x] **Task 5**: Wire into meta-package
  - File: `packages/supi/package.json` — add `@mrclrchtr/supi-web` to `dependencies` and `bundledDependencies`
  - File: `packages/supi/src/web.ts` — thin wrapper re-export
  - File: `packages/supi/package.json` — add `./src/web.ts` to `pi.extensions`
  - Verification: `pnpm exec tsc --noEmit -p packages/supi/tsconfig.json` passes

- [x] **Task 6**: Remove old skill and run full verification
  - Remove: `.agents/skills/web-fetch-to-markdown/` directory
  - Verification: `pnpm verify` passes (typecheck, tests, biome)
