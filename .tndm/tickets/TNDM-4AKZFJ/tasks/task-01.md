# Task 1: Write failing tests for tool-framework module

Create `packages/supi-core/__tests__/unit/tool-framework.test.ts`.

Test coverage:
- `derivePromptSurface(spec)` copies description, promptSnippet, and promptGuidelines arrays
- `registerSuiPiTools(pi, specs, surfaces, createExecute)` calls `pi.registerTool` once per spec
- Each `pi.registerTool` call receives the correct fields: name, label, description, promptSnippet, promptGuidelines from the surface, parameters from the spec
- `createExecute` is called once per spec and receives that spec as argument
- Shared param builders (`FileParam`, `LineParam`, `CharacterParam`, `SymbolParam`, `MaxResultsParam`) exist and are valid TypeBox schemas

Use `vi.mock("@mrclrchtr/supi-test-utils", ...)` for pi mocks since we need to mock `ExtensionAPI`. Alternatively, use a minimal inline mock for `pi.registerTool` — the test only needs `registerTool` to be a `vi.fn()`.

The test should expect FAIL on first run since `src/tool-framework.ts` doesn't exist yet.
