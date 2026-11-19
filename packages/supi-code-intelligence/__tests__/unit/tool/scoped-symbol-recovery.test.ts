import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  completedCodeQuery,
  partialCodeQuery,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
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
          : { search: { semantic: { query: "Widget" } }, scopes: [scope] };
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
          : { search: { semantic: { query: "Widget" } } };
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

  it("keeps only the row-limit next step when a cut answer leaves the scope empty", async () => {
    const reason =
      "The TypeScript server returned its limit of 256 workspace symbols; more matches may exist. Use a more specific query, or pass an anchor target (file, line, character).";
    const session = new WorkspaceCodeIntelligenceSession(
      cwd,
      new TestCapabilityAdapter({
        semantic: {
          references: async () => completedCodeQuery([]),
          implementation: async () => completedCodeQuery([]),
          documentSymbols: fileDocumentSymbolsMock(),
          // Every row of the cut answer lies outside the scope.
          workspaceSymbols: async () =>
            partialCodeQuery([], reason, { rowLimit: { exactNamesComplete: false } }),
        },
      }),
    );
    const limited = createPiMock();
    registerCodeIntelligenceTools(limited as never, () => session, undefined, [codeResolveSpec]);
    const call = getTool(limited, "code_resolve").execute(
      "row-limit",
      { target: { symbol: { query: "result", scope } } },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );

    await expect(call).rejects.toThrow("pass an anchor target");
    // target.file lists no body-local declarations and points back to this query.
    await expect(call).rejects.not.toThrow("Next steps:");
  });

  it("does not add LSP recovery guidance to AST failures", async () => {
    const call = getTool(pi, "code_find").execute(
      "ast-failure",
      { search: { ast: { kind: "definition", query: "Widget" } }, scopes: [scope] },
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
