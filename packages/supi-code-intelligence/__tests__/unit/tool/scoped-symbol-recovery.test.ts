import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { completedCodeQuery, unavailableCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceCodeIntelligenceSession } from "../../../src/session/session.ts";
import { codeFindSpec } from "../../../src/tool/code_find/spec.ts";
import { codeResolveSpec } from "../../../src/tool/code_resolve/spec.ts";
import { registerCodeIntelligenceTools } from "../../../src/tool/register.ts";
import { fileDocumentSymbolsMock } from "../../helpers/register-mock-runtime.ts";
import { TestCapabilityAdapter } from "../../helpers/test-capability-adapter.ts";

const NO_ROUTE = "No known LSP route intersects the requested workspace-symbol scope.";
let root: string;
let cwd: string;
let scope: string;
let file: string;
let pi: ReturnType<typeof createPiMock>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "scoped-symbol-recovery-"));
  cwd = join(root, "workspace");
  scope = join(root, "other-project");
  mkdirSync(cwd);
  mkdirSync(scope);
  file = join(scope, "Widget.ts");
  writeFileSync(file, "export function Widget() {}\n");
  const session = new WorkspaceCodeIntelligenceSession(
    cwd,
    new TestCapabilityAdapter({
      semantic: {
        references: async () => completedCodeQuery([]),
        implementation: async () => completedCodeQuery([]),
        documentSymbols: fileDocumentSymbolsMock(),
        workspaceSymbols: async () => unavailableCodeQuery(NO_ROUTE),
      },
    }),
  );
  pi = createPiMock();
  registerCodeIntelligenceTools(pi as never, () => session, undefined, [
    codeResolveSpec,
    codeFindSpec,
  ]);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("public scoped symbol recovery guidance", () => {
  it.each(["code_resolve", "code_find"] as const)(
    "gives %s same-session recovery actions",
    async (name) => {
      const params =
        name === "code_resolve"
          ? { target: { symbol: { query: "Widget", scope } } }
          : { query: "Widget", mode: "semantic", scope: [scope] };
      const call = getTool(pi, name).execute(
        "missing-route",
        params,
        undefined,
        undefined,
        makeCtx({ cwd }),
      );

      await expect(call).rejects.toThrow(NO_ROUTE);
      await expect(call).rejects.toThrow("target.file");
      await expect(call).rejects.toThrow("bash");
      await expect(call).rejects.toThrow("Use a returned handle directly");
      await expect(call).rejects.toThrow("does not confirm that the full workspace index is ready");
      await expect(call).rejects.not.toThrow(/new session|outside the current workspace/i);
    },
  );

  it.each(["code_resolve", "code_find"] as const)(
    "keeps unscoped %s failures unchanged",
    async (name) => {
      const params =
        name === "code_resolve"
          ? { target: { symbol: { query: "Widget" } } }
          : { query: "Widget", mode: "semantic" };
      const call = getTool(pi, name).execute(
        "unscoped-failure",
        params,
        undefined,
        undefined,
        makeCtx({ cwd }),
      );

      await expect(call).rejects.toThrow(NO_ROUTE);
      await expect(call).rejects.not.toThrow("Next steps:");
    },
  );

  it("does not add LSP recovery guidance to AST failures", async () => {
    const call = getTool(pi, "code_find").execute(
      "ast-failure",
      { query: "Widget", mode: "ast", kind: "definition", scope: [scope] },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );

    await expect(call).rejects.toThrow();
    await expect(call).rejects.not.toThrow("target.file");
  });

  it("accepts the suggested exact-file selector outside the session directory", async () => {
    const result = await getTool(pi, "code_resolve").execute(
      "exact-file",
      { target: { file } },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );

    expect(result).toMatchObject({
      details: {
        status: "completed",
        data: {
          resultKind: "file-outline",
          targets: [expect.objectContaining({ name: "Widget", targetId: expect.any(String) })],
        },
      },
    });
  });
});
