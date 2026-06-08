# Task 3: Add naming-mismatch test case

## Goal
Verify that test discovery works when test file names don't match source file names.

## File
`packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts`

## Change
Add a new test case in the `tests relation` describe block:

```ts
it("finds test via import analysis when naming conventions differ", async () => {
  // source: src/tool/execute-find.ts
  writeSource("src/tool/execute-find.ts", "export function executeFind() { return 1; }\n");

  // test: __tests__/code-find-tool.test.ts (different name, but imports execute-find)
  const { mkdirSync } = await import("node:fs");
  const testDir = path.join(tmpDir, "__tests__");
  mkdirSync(testDir, { recursive: true });
  writeSource(
    "__tests__/code-find-tool.test.ts",
    "import { executeFind } from '../src/tool/execute-find';\nvoid executeFind;\n"
  );

  const result = await executeAction(
    {
      action: "graph",
      file: "src/tool/execute-find.ts",
      line: 1,
      character: 1,
      relations: ["tests"],
    } as unknown as ActionParams,
    { cwd: tmpDir },
  );

  expect(result.content).toContain("tests");
  expect(result.content).toContain("__tests__/code-find-tool.test.ts");
});
```

## Verification
- Test passes
- Test fails if stem matching is used (proves import analysis is working)
