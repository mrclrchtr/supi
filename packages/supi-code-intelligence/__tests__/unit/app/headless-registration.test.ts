import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getTool, getTools, makeCtx } from "@mrclrchtr/supi-test-utils";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import headlessInspectionProfile from "../../../src/headless.ts";
import { CODE_INTELLIGENCE_TOOL_SPECS } from "../../../src/tool/specs.ts";
import { clearMockRuntime, registerMockProvider } from "../../helpers/register-mock-runtime.ts";

describe("headless inspection profile", () => {
  it("preserves native and readable results for the three migrated inspection tools", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "headless-native-"));
    writeFileSync(join(cwd, "index.ts"), "export const value = 1;\n");
    registerMockProvider(cwd);
    try {
      const pi = createPiMock();
      headlessInspectionProfile(pi as unknown as ExtensionAPI);
      for (const [name, args] of [
        ["code_inspect", { point: { file: "index.ts", line: 1, character: 14 } }],
        ["code_orientation", {}],
        ["code_health", { include: ["servers"] }],
      ] as const) {
        const tool = getTool(pi, name) as unknown as {
          outputSchema: TSchema;
          execute: (
            ...args: unknown[]
          ) => Promise<{ content: unknown[]; structuredContent: unknown }>;
        };
        const result = await tool.execute("headless", args, undefined, undefined, makeCtx({ cwd }));
        expect([...Value.Errors(tool.outputSchema, result.structuredContent)]).toEqual([]);
        expect(JSON.parse(JSON.stringify(result.structuredContent))).toEqual(
          result.structuredContent,
        );
        expect(result.content).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: "text", text: expect.any(String) }),
          ]),
        );
      }
    } finally {
      clearMockRuntime();
      rmSync(cwd, { recursive: true, force: true });
    }
  });
  it("registers exactly the six non-mutating Code Intelligence tools", () => {
    const pi = createPiMock();
    headlessInspectionProfile(pi as unknown as ExtensionAPI);

    expect(
      getTools(pi)
        .map((tool) => tool.name)
        .filter((name) => name.startsWith("code_")),
    ).toEqual([
      "code_resolve",
      "code_inspect",
      "code_orientation",
      "code_graph",
      "code_find",
      "code_health",
    ]);
    expect(pi.commands.size).toBe(0);
    for (const tool of getTools(pi)) {
      const { outputSchema } = tool as unknown as { outputSchema: TSchema };
      expect(outputSchema).toBeDefined();
      expect(outputSchema).toEqual(
        CODE_INTELLIGENCE_TOOL_SPECS.find((spec) => spec.name === tool.name)?.outputSchema,
      );
    }
  });
});
