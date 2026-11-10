// tsserver answers references only from loaded projects. A test project that
// includes `../src` stays unloaded until one of its files is open, so its
// references are silently missing unless the runtime reports partial coverage.
// Implementations are narrower still: tsserver searches only the file's own
// project, so opening other projects' files does not help.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LspConfig } from "../../src/config/types.ts";
import { LspManager } from "../../src/manager/manager.ts";
import { createWorkspaceLspRuntimeOwner } from "../../src/session/runtime-registry.ts";
import { hasCommand } from "../helpers/integration-utils.ts";

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

function write(root: string, file: string, content: string): string {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

describe.skipIf(!HAS_TS_LSP)("TypeScript project coverage for project-wide queries", () => {
  let tmpDir: string | undefined;
  let shutdown: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await shutdown?.();
    shutdown = undefined;
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it("reports partial references until the including test project is loaded", async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ts-project-coverage-")));
    const compilerOptions = { strict: true, noEmit: true, target: "ES2022", module: "ESNext" };
    write(tmpDir, "tsconfig.json", JSON.stringify({ compilerOptions, include: ["src/**/*.ts"] }));
    write(
      tmpDir,
      "__tests__/tsconfig.json",
      JSON.stringify({ compilerOptions, include: ["**/*.ts", "../src/**/*.ts"] }),
    );
    const source = write(tmpDir, "src/value.ts", "export const value = 1;\n");
    write(tmpDir, "src/use.ts", 'import { value } from "./value";\nexport const used = value;\n');
    const testFile = write(
      tmpDir,
      "__tests__/value.test.ts",
      'import { value } from "../src/value";\nexport const checked = value;\n',
    );
    const owner = createWorkspaceLspRuntimeOwner(new LspManager(TS_CONFIG, tmpDir));
    shutdown = owner.shutdown;
    const position = { line: 0, character: 13 };

    const before = await owner.runtime.references(source, position);
    expect(before.kind).toBe("partial");
    if (before.kind !== "partial") return;
    expect(before.reason).toContain(path.join("__tests__", "tsconfig.json"));
    expect(before.data.some((location) => location.uri.endsWith("/__tests__/value.test.ts"))).toBe(
      false,
    );

    expect(await owner.runtime.trackFile(testFile)).toBe(true);
    const after = await owner.runtime.references(source, position);
    expect(after.kind).toBe("completed");
    if (after.kind !== "completed") return;
    expect(after.data.some((location) => location.uri.endsWith("/__tests__/value.test.ts"))).toBe(
      true,
    );
  }, 60_000);

  it("keeps references complete for an unexported declaration other projects cannot reach", async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ts-project-coverage-")));
    const compilerOptions = { strict: true, noEmit: true, target: "ES2022", module: "ESNext" };
    write(tmpDir, "tsconfig.json", JSON.stringify({ compilerOptions, include: ["src/**/*.ts"] }));
    write(
      tmpDir,
      "__tests__/tsconfig.json",
      JSON.stringify({ compilerOptions, include: ["**/*.ts", "../src/**/*.ts"] }),
    );
    const source = write(
      tmpDir,
      "src/value.ts",
      "function helper() {\n  return 1;\n}\nexport const value = helper();\n",
    );
    write(tmpDir, "__tests__/value.test.ts", 'export { value } from "../src/value";\n');
    const owner = createWorkspaceLspRuntimeOwner(new LspManager(TS_CONFIG, tmpDir));
    shutdown = owner.shutdown;

    const helper = await owner.runtime.references(source, { line: 0, character: 9 });
    expect(helper.kind).toBe("completed");
    // The exported value in the same file still reports the unloaded test project.
    const value = await owner.runtime.references(source, { line: 3, character: 13 });
    expect(value.kind).toBe("partial");
  }, 60_000);

  it("reports tsserver implementations as single-project even after other projects load", async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ts-project-coverage-")));
    const compilerOptions = { strict: true, noEmit: true, target: "ES2022", module: "ESNext" };
    write(tmpDir, "tsconfig.json", JSON.stringify({ compilerOptions, include: ["src/**/*.ts"] }));
    write(
      tmpDir,
      "__tests__/tsconfig.json",
      JSON.stringify({ compilerOptions, include: ["**/*.ts", "../src/**/*.ts"] }),
    );
    const source = write(
      tmpDir,
      "src/shape.ts",
      "export interface Shape {\n  area(): number;\n}\n",
    );
    const testFile = write(
      tmpDir,
      "__tests__/shape.test.ts",
      'import type { Shape } from "../src/shape";\nexport class Square implements Shape {\n  area() {\n    return 1;\n  }\n}\n',
    );
    const owner = createWorkspaceLspRuntimeOwner(new LspManager(TS_CONFIG, tmpDir));
    shutdown = owner.shutdown;
    expect(await owner.runtime.trackFile(testFile)).toBe(true);

    const result = await owner.runtime.implementation(source, { line: 0, character: 17 });
    expect(result.kind).toBe("partial");
    if (result.kind !== "partial") return;
    expect(result.reason).toContain("only in this file's project");
    expect(result.reason).not.toContain("Open a file");
  }, 60_000);
});
