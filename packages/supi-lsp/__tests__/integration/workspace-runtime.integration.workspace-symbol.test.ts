import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LspConfig } from "../../src/config/types.ts";
import { LspManager } from "../../src/manager/manager.ts";
import { createWorkspaceLspRuntimeOwner } from "../../src/session/runtime-registry.ts";

const CONFIG: LspConfig = {
  servers: {
    typescript: {
      command: "typescript-language-server",
      args: ["--stdio"],
      fileTypes: ["ts", "tsx", "js"],
      rootMarkers: ["tsconfig.json", "package.json"],
      initializationOptions: {
        tsserver: {
          path: resolve(import.meta.dirname, "../../../../node_modules/typescript/lib/tsserver.js"),
        },
      },
    },
  },
};

const workspaces: Array<{
  root: string;
  owner: ReturnType<typeof createWorkspaceLspRuntimeOwner>;
}> = [];

async function createWorkspace(server: "typescript" | "open-files" | "failure" = "typescript") {
  const root = mkdtempSync(join(tmpdir(), "lsp-cold-symbol-"));
  const config: LspConfig =
    server === "typescript"
      ? CONFIG
      : {
          servers: {
            fixture: {
              command: process.execPath,
              args: [
                resolve(import.meta.dirname, "../fixtures/lsp-semantic-server.mjs"),
                join(root, "server.log"),
                "0",
                server === "failure" ? "--workspace-symbol-error" : "--workspace-symbol-open-files",
              ],
              fileTypes: ["ts", "tsx", "js"],
              rootMarkers: ["tsconfig.json"],
            },
          },
        };
  const manager = new LspManager(config, root);
  const owner = createWorkspaceLspRuntimeOwner(manager);
  workspaces.push({ root, owner });
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { allowJs: true, noEmit: true },
      include: ["src/**/*.ts", "src/**/*.tsx"],
    }),
  );
  writeFileSync(join(root, "eslint.config.js"), "export default {};\n");
  const writeSource = (relativePath: string, name: string) => {
    const file = join(root, relativePath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `export function ${name}() { return null; }\n`);
    return file;
  };
  writeSource("src/feature/Widget.tsx", "Widget");
  const serverName = server === "typescript" ? "typescript" : "fixture";
  expect(await manager.startServerForRoot(serverName, root)).not.toBeNull();
  return { root, runtime: owner.runtime, writeSource };
}

afterEach(async () => {
  for (const { root, owner } of workspaces.splice(0)) {
    await owner.shutdown();
    rmSync(root, { recursive: true, force: true });
  }
});

describe("workspace-symbol cold recovery", () => {
  it("keeps the current failure when the retry also fails", async () => {
    const { runtime } = await createWorkspace("failure");

    await expect(runtime.workspaceSymbol("Widget")).resolves.toEqual({
      kind: "unavailable",
      reason: "LSP request workspace/symbol failed: Workspace-symbol retry failed.",
    });
  });

  it("returns a completed-empty retry instead of the initial No Project error", async () => {
    const { runtime } = await createWorkspace();

    await expect(runtime.workspaceSymbol("MissingSymbol")).resolves.toEqual({
      kind: "completed",
      data: [],
    });
  }, 15_000);

  it("finds a scoped application symbol before any application file is opened", async () => {
    const { runtime } = await createWorkspace();

    await expect(
      runtime.workspaceSymbol("Widget", undefined, ["src/feature"]),
    ).resolves.toMatchObject({
      kind: "completed",
      data: [expect.objectContaining({ name: "Widget" })],
    });
  }, 15_000);

  it("warms two directory scopes under the same route", async () => {
    const { runtime, writeSource } = await createWorkspace("open-files");
    writeSource("src/other/OtherWidget.tsx", "OtherWidget");
    await expect(
      runtime.workspaceSymbol("Widget", undefined, ["src/feature"]),
    ).resolves.toMatchObject({
      kind: "completed",
      data: [expect.objectContaining({ name: "Widget" })],
    });

    await expect(
      runtime.workspaceSymbol("OtherWidget", undefined, ["src/other"]),
    ).resolves.toMatchObject({
      kind: "completed",
      data: [expect.objectContaining({ name: "OtherWidget" })],
    });
  }, 15_000);

  it("continues after empty results across overlapping scopes", async () => {
    const { runtime, writeSource } = await createWorkspace("open-files");
    writeSource("src/other/OtherWidget.tsx", "OtherWidget");

    await expect(
      runtime.workspaceSymbol("OtherWidget", undefined, ["src/feature", "src", "src/other"]),
    ).resolves.toMatchObject({
      kind: "completed",
      data: [expect.objectContaining({ name: "OtherWidget" })],
    });
  });

  it("opens a nested project route discovered from its parent", async () => {
    const { root, runtime, writeSource } = await createWorkspace("open-files");
    writeSource("packages/feature/NestedWidget.tsx", "NestedWidget");
    writeFileSync(join(root, "packages/feature/tsconfig.json"), "{}\n");

    await expect(
      runtime.workspaceSymbol("NestedWidget", undefined, ["packages"]),
    ).resolves.toMatchObject({
      kind: "completed",
      data: [expect.objectContaining({ name: "NestedWidget" })],
    });
  });

  it("finds a symbol when root config files sit outside the configured program", async () => {
    const { root, runtime } = await createWorkspace();
    // Both sort before src/ and land in inferred projects when opened alone.
    writeFileSync(join(root, ".dependency-cruiser.cjs"), "module.exports = {};\n");
    writeFileSync(join(root, "knip.config.ts"), "export default {};\n");

    await expect(runtime.workspaceSymbol("Widget")).resolves.toMatchObject({
      kind: "completed",
      data: [expect.objectContaining({ name: "Widget" })],
    });
  }, 15_000);

  it("reports partial coverage when every warm-up file is in an inferred project", async () => {
    const { root, runtime } = await createWorkspace();
    rmSync(join(root, "src"), { recursive: true, force: true });
    writeFileSync(join(root, ".dependency-cruiser.cjs"), "module.exports = {};\n");

    await expect(runtime.workspaceSymbol("Widget")).resolves.toMatchObject({
      kind: "partial",
      data: [],
      reason: expect.stringContaining("loaded only inferred projects"),
    });
  }, 15_000);

  it("warms a second selected file under the same route", async () => {
    const { runtime, writeSource } = await createWorkspace("open-files");
    const secondFile = writeSource("src/feature/OtherWidget.tsx", "OtherWidget");
    await expect(
      runtime.workspaceSymbol("Widget", undefined, ["src/feature/Widget.tsx"]),
    ).resolves.toMatchObject({
      kind: "completed",
      data: [expect.objectContaining({ name: "Widget" })],
    });

    await expect(
      runtime.workspaceSymbol("OtherWidget", undefined, [secondFile]),
    ).resolves.toMatchObject({
      kind: "completed",
      data: [expect.objectContaining({ name: "OtherWidget" })],
    });
  }, 15_000);
});
