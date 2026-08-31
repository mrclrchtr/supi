import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileToUri } from "@mrclrchtr/supi-core/path";
import { afterEach, describe, expect, it } from "vitest";
import { getFileScopeDecision } from "../../src/config/tsconfig-scope.ts";
import { FileChangeType } from "../../src/config/types.ts";
import { LspManager } from "../../src/manager/manager.ts";

let root = "";

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = "";
});

describe("LspManager tsconfig invalidation", () => {
  it("uses a newly created nested tsconfig after a workspace change", () => {
    root = mkdtempSync(join(tmpdir(), "manager-tsconfig-create-"));
    const nestedRoot = join(root, "packages/app");
    const sourceFile = join(nestedRoot, "src/app.ts");
    mkdirSync(dirname(sourceFile), { recursive: true });
    writeFileSync(join(nestedRoot, "jsconfig.json"), '{"include":["**/*.ts"]}');
    writeFileSync(sourceFile, "export const app = true;\n");
    expect(getFileScopeDecision("packages/app/src/app.ts", root).status).toBe("included");

    const nestedConfig = join(nestedRoot, "tsconfig.json");
    writeFileSync(nestedConfig, '{"include":["other/**/*.ts"]}');
    const manager = new LspManager({ servers: {} }, root);
    manager.noteWorkspaceChanges([{ uri: fileToUri(nestedConfig), type: FileChangeType.Created }]);

    expect(getFileScopeDecision("packages/app/src/app.ts", root).status).toBe("excluded");
  });
});
