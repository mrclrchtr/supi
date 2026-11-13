import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { fileToUri } from "@mrclrchtr/supi-core/path";
import { LspRuntimeController } from "@mrclrchtr/supi-lsp/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceCodeIntelligenceSession } from "../../../../src/session/session.ts";
import { codeFindSpec } from "../../../../src/tool/code_find/spec.ts";
import { codeResolveSpec } from "../../../../src/tool/code_resolve/spec.ts";
import { registerCodeIntelligenceTools } from "../../../../src/tool/register.ts";
import type { CodeIntelResult } from "../../../../src/types/index.ts";
import { writeIsolatedFixtureConfig } from "../../../helpers/public-lsp-config.ts";

const FIXTURE = path.resolve(
  import.meta.dirname,
  "../../../../../supi-lsp/__tests__/fixtures/lsp-semantic-server.mjs",
);

describe("registered tools with scoped workspace-symbol completeness", () => {
  let cwd: string;
  let controller: LspRuntimeController;
  afterEach(async () => {
    await controller?.shutdown();
    if (cwd) {
      getDefaultWorkspaceRuntime().clearWorkspace(cwd);
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  const files = ["src/main.test", "dist/generated.test", "other/other.test"];

  function symbolRows(requiresOpen: readonly string[] = []) {
    return files.map((file) => ({
      ...(requiresOpen.includes(file) ? { requiresOpen: true } : {}),
      name: "work",
      kind: 12,
      location: {
        uri: fileToUri(path.join(cwd, file)),
        range: {
          start: { line: 0, character: 9 },
          end: { line: 0, character: 13 },
        },
      },
    }));
  }

  async function startTools(requiresOpen: readonly string[] = []) {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "scoped-symbol-tool-"));
    fs.writeFileSync(path.join(cwd, "project.marker"), "");
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
      fs.writeFileSync(path.join(cwd, file), "function work() {}\n");
    }
    const symbols = path.join(cwd, "symbols.json");
    fs.writeFileSync(symbols, JSON.stringify(symbolRows(requiresOpen)));
    writeIsolatedFixtureConfig(cwd, {
      args: [
        FIXTURE,
        path.join(cwd, "protocol.log"),
        "0",
        "pull",
        `--workspace-symbol-results=${symbols}`,
      ],
      fileTypes: ["test"],
    });
    controller = new LspRuntimeController(cwd, getDefaultWorkspaceRuntime());
    const started = await controller.start();
    if (started.kind !== "ready") throw new Error(`Fixture did not start: ${started.kind}`);
    await expect(started.runtime.trackFile(path.join(cwd, files[0]))).resolves.toBe(true);
    const session = new WorkspaceCodeIntelligenceSession(cwd);
    const pi = createPiMock();
    registerCodeIntelligenceTools(pi as never, () => session, undefined, [
      codeResolveSpec,
      codeFindSpec,
    ]);
    const resolve = getTool(pi, "code_resolve");
    const callResolve = async (scope: string) => {
      const result = (await resolve.execute(
        "resolve-scope",
        {
          target: { symbol: { query: "work", scope, symbolKind: "function" } },
        },
        undefined,
        undefined,
        makeCtx({ cwd }),
      )) as CodeIntelResult;
      return result.structuredContent;
    };
    return { pi, symbols, callResolve };
  }

  it("resolves a unique source candidate and discloses excluded generated evidence", async () => {
    const { pi, symbols, callResolve } = await startTools();
    for (const scope of ["src/main.test", "src"]) {
      expect(await callResolve(scope)).toMatchObject({
        kind: "resolved",
        targets: [{ name: "work", file: "src/main.test" }],
        evidenceLists: [{ totalCount: 1, shownCount: 1, partialReason: null }],
      });
    }
    // An excluded generated candidate in the requested universe is policy
    // evidence, not missing coverage: the one in-policy candidate resolves
    // and the exclusion stays disclosed.
    fs.writeFileSync(symbols, JSON.stringify(symbolRows().slice(0, 2)));
    const broad = await callResolve(".");
    expect(broad).toMatchObject({
      kind: "resolved",
      targets: [{ name: "work", file: "src/main.test" }],
    });
    expect(JSON.stringify(broad)).toContain("dist/generated.test");
    const found = (await getTool(pi, "code_find").execute(
      "find-scope",
      { search: { semantic: { query: "work" } }, scopes: ["src"] },
      undefined,
      undefined,
      makeCtx({ cwd }),
    )) as CodeIntelResult;
    expect(found.structuredContent).toMatchObject({
      kind: "completed",
      matches: [{ name: "work", file: "src/main.test" }],
      evidenceLists: [{ totalCount: 1, shownCount: 1, partialReason: null }],
    });
  });

  it.each(["dist/generated.test", "dist"])(
    "resolves a cold explicitly excluded %s scope instead of reporting not found",
    async (scope) => {
      // The server reports the generated row only after its document opens.
      const { callResolve } = await startTools(["dist/generated.test"]);
      expect(await callResolve(scope)).toMatchObject({
        kind: "resolved",
        targets: [{ name: "work", file: "dist/generated.test" }],
      });
    },
  );
});
