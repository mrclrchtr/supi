// Public WorkspaceLspRuntime freshness integration tests.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Diagnostic, LspConfig } from "../../src/config/types.ts";
import { LspManager } from "../../src/manager/manager.ts";
import { createWorkspaceLspRuntimeOwner } from "../../src/session/runtime-registry.ts";
import { hasCommand, waitFor } from "../helpers/integration-utils.ts";

const TSSERVER = path.resolve(
  import.meta.dirname,
  "../../../../node_modules/typescript/lib/tsserver.js",
);
const HAS_TS_LSP = hasCommand("typescript-language-server") && fs.existsSync(TSSERVER);

const TS_CONFIG: LspConfig = {
  servers: {
    typescript: {
      command: "typescript-language-server",
      args: ["--stdio"],
      fileTypes: ["ts"],
      rootMarkers: ["tsconfig.json"],
      initializationOptions: { tsserver: { path: TSSERVER } },
    },
  },
};

function hasTypeError(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === 1 &&
      typeof diagnostic.message === "string" &&
      diagnostic.message.includes("not assignable"),
  );
}

describe.skipIf(!HAS_TS_LSP)("public WorkspaceLspRuntime semantic input barrier", () => {
  let tmpDir: string | undefined;
  let shutdown: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await shutdown?.();
    shutdown = undefined;
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it("synchronizes an unreported disk edit to an open dependency before diagnostics", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-runtime-input-barrier-"));
    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, noEmit: true, target: "ES2022", module: "ESNext" },
        include: ["*.ts"],
      }),
    );
    const dependency = path.join(tmpDir, "value.ts");
    const consumer = path.join(tmpDir, "consumer.ts");
    const initialDependency = "export const value: number = 1;\n";
    const changedDependency = 'export const value: string = "changed";\n';
    const consumerContent =
      'import { value } from "./value";\nexport const result: number = value;\n';
    fs.writeFileSync(dependency, initialDependency);
    fs.writeFileSync(consumer, consumerContent);

    const owner = createWorkspaceLspRuntimeOwner(new LspManager(TS_CONFIG, tmpDir));
    shutdown = owner.shutdown;
    const runtime = owner.runtime;

    await expect(runtime.fileDiagnostics(consumer)).resolves.toMatchObject({
      kind: "completed",
      data: [],
    });
    await expect(runtime.fileDiagnostics(dependency)).resolves.toMatchObject({
      kind: "completed",
    });

    fs.writeFileSync(dependency, changedDependency);

    const result = await waitFor(
      () => runtime.fileDiagnostics(consumer),
      (candidate) => candidate.kind === "completed" && hasTypeError(candidate.data),
      { timeoutMs: 10_000, retryDelayMs: 100, label: "dependent diagnostics after disk edit" },
    );

    expect(result).toMatchObject({ kind: "completed" });
    if (result.kind === "completed") expect(hasTypeError(result.data)).toBe(true);
  }, 25_000);
});
