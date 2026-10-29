import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/config.ts";
import { LspManager } from "../../src/manager/manager.ts";
import { createWorkspaceLspRuntimeOwner } from "../../src/session/runtime-registry.ts";
import { scanMissingServers, scanProjectCapabilities } from "../../src/session/scanner.ts";
import { waitFor } from "../helpers/integration-utils.ts";

const require = createRequire(import.meta.url);
const native = path.dirname(require.resolve("@typescript/native/package.json"));
const legacy = path.dirname(require.resolve("typescript/package.json"));
let root: string | undefined;
let owner: ReturnType<typeof createWorkspaceLspRuntimeOwner> | undefined;

afterEach(async () => {
  await owner?.shutdown();
  owner = undefined;
  vi.unstubAllEnvs();
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
});

// Installation layouts deliberately share only startup checks, not a duplicate
// semantic matrix. Public TypeScript/JavaScript acceptance owns that matrix.
it.each(["native-only", "mixed"])(
  "discovers and retries %s native installs without TLS, then re-resolves after a real process crash",
  async (layout) => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "supi-ts7-launch-")));
    const selectedName = layout === "mixed" ? "@typescript/native" : "typescript";
    const link = path.join(root, "node_modules", selectedName);
    fs.mkdirSync(path.dirname(link), { recursive: true });
    if (layout === "mixed")
      fs.symlinkSync(legacy, path.join(root, "node_modules/typescript"), "dir");
    const broken = path.join(root, "broken");
    fs.mkdirSync(broken);
    fs.writeFileSync(
      path.join(broken, "package.json"),
      JSON.stringify({ name: "typescript", version: "7.0.2", bin: { tsc: "fail.cjs" } }),
    );
    fs.writeFileSync(
      path.join(broken, "fail.cjs"),
      'process.stderr.write("selected native startup failed"); process.exit(1);',
    );
    fs.symlinkSync(broken, link, "dir");
    fs.writeFileSync(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, noEmit: true, target: "ES2022" },
        include: ["*.ts"],
      }),
    );
    const file = path.join(root, "index.ts");
    fs.writeFileSync(file, 'export const answer: number = "wrong";\n');
    vi.stubEnv("PATH", "");
    const typescript = loadConfig(root, { homeDir: path.join(root, "home") }).servers.typescript;
    if (!typescript) throw new Error("Missing TypeScript route");
    const config = { servers: { typescript } };
    expect(scanProjectCapabilities(config, root)).toMatchObject([
      {
        root,
        typescript: { backend: "native", packageName: selectedName, compilerVersion: "7.0.2" },
      },
    ]);
    expect(scanMissingServers(config, root)).toEqual([]);
    const manager = new LspManager(config, root);
    owner = createWorkspaceLspRuntimeOwner(manager);
    const runtime = owner.runtime;

    // A selected process failure is final for this attempt, never a TLS fallback.
    await expect(runtime.waitUntilReadyForFile(file)).resolves.toMatchObject({
      kind: "unavailable",
    });
    expect(runtime.getProjectServers()).toMatchObject([
      {
        status: "error",
        typescript: { backend: "native" },
        failureMessage: expect.stringContaining("selected native startup failed"),
      },
    ]);
    fs.unlinkSync(link);
    fs.symlinkSync(native, link, "dir");
    await expect(
      runtime.waitUntilReadyForFile(file, { retryFailedRoute: true, timeoutMs: 20_000 }),
    ).resolves.toMatchObject({ kind: "ready" });
    expect(JSON.stringify(await runtime.hover(file, { line: 0, character: 14 }))).toContain(
      "answer: number",
    );
    const errors = await runtime.fileDiagnostics(file);
    expect(errors).toMatchObject({
      kind: "completed",
      data: expect.arrayContaining([
        expect.objectContaining({
          severity: 1,
          message: expect.stringContaining("not assignable"),
        }),
      ]),
    });
    fs.writeFileSync(file, "export const answer: number = 42;\n");
    await expect(runtime.fileDiagnostics(file)).resolves.toMatchObject({
      kind: "completed",
      data: [],
    });

    // Repair to a different launcher path while retaining the healthy process.
    const repaired = path.join(root, "repaired");
    fs.mkdirSync(repaired);
    fs.writeFileSync(
      path.join(repaired, "package.json"),
      JSON.stringify({ name: "typescript", version: "7.0.2", bin: { tsc: "new-launcher.mjs" } }),
    );
    const startupMarker = path.join(repaired, "started");
    fs.writeFileSync(
      path.join(repaired, "new-launcher.mjs"),
      `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(startupMarker)}, "started");\nawait import(${JSON.stringify(pathToFileURL(path.join(native, "bin/tsc")).href)});`,
    );
    fs.unlinkSync(link);
    fs.symlinkSync(repaired, link, "dir");
    const original = await manager.getClientForFile(file);
    const pid = (original as unknown as { process: { pid?: number } }).process?.pid;
    if (!pid) throw new Error("Expected a live native process");
    await runtime.hover(file, { line: 0, character: 14 });
    expect(await manager.getClientForFile(file)).toBe(original);
    expect(fs.existsSync(startupMarker)).toBe(false);
    process.kill(pid, "SIGKILL");
    await waitFor(
      async () => runtime.getProjectServers()[0]?.statusReason,
      (reason) => reason === "process-crashed",
      { label: "native process crash" },
    );
    const recovered = await runtime.recoverDiagnostics({
      restartIfStillStale: false,
      processCrashDemand: { scopes: [file] },
    });
    expect(recovered.processCrashRecovery).toMatchObject({ recoveredRoutes: 1 });
    expect(fs.readFileSync(startupMarker, "utf8")).toBe("started");
    await expect(runtime.fileDiagnostics(file)).resolves.toMatchObject({
      kind: "completed",
      data: [],
    });
    expect(runtime.getProjectServers()).toMatchObject([
      {
        status: "running",
        typescript: { backend: "native", packageName: selectedName, compilerVersion: "7.0.2" },
      },
    ]);
    if (layout === "native-only") {
      const dependency = path.join(root, "value.ts");
      fs.writeFileSync(dependency, "export const value: number = 1;\n");
      fs.writeFileSync(
        file,
        'import { value } from "./value";\nexport const answer: number = value;\n',
      );
      await expect(runtime.fileDiagnostics(file)).resolves.toMatchObject({
        kind: "completed",
        data: [],
      });
      await runtime.fileDiagnostics(dependency);
      fs.writeFileSync(dependency, 'export const value: string = "changed";\n');
      const invalidated = await runtime.fileDiagnostics(file);
      expect(invalidated).toMatchObject({
        kind: "completed",
        data: expect.arrayContaining([
          expect.objectContaining({
            severity: 1,
            message: expect.stringContaining("not assignable"),
          }),
        ]),
      });
      fs.writeFileSync(dependency, "export const value: number = 1;\n");
      expect(await runtime.refreshOpenDiagnostics()).toMatchObject({
        requested: 2,
        confirmed: 2,
        unconfirmed: 0,
        failed: 0,
      });
      await expect(runtime.fileDiagnostics(file)).resolves.toMatchObject({
        kind: "completed",
        data: [],
      });
    }
    await owner.shutdown();
    expect(runtime.getProjectServers()).toEqual([]);
  },
  60_000,
);

it("reports known native selection facts when launch-file validation fails without TLS", async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "supi-ts7-broken-")));
  fs.mkdirSync(path.join(root, "node_modules/typescript"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "node_modules/typescript/package.json"),
    JSON.stringify({ name: "typescript", version: "7.0.2", bin: { tsc: "missing.cjs" } }),
  );
  fs.writeFileSync(path.join(root, "tsconfig.json"), "{}");
  const file = path.join(root, "index.ts");
  fs.writeFileSync(file, "export const value = 1;");
  const typescript = loadConfig(root, { homeDir: path.join(root, "home") }).servers.typescript;
  if (!typescript) throw new Error("Missing TypeScript route");
  vi.stubEnv("PATH", "");
  const config = { servers: { typescript } };
  const detected = scanProjectCapabilities(config, root);
  expect(detected).toMatchObject([
    {
      typescript: { backend: "native", packageName: "typescript", compilerVersion: "7.0.2" },
      failureMessage: expect.stringContaining("missing.cjs"),
    },
  ]);
  expect(scanMissingServers(config, root)).toMatchObject([
    { failureMessage: detected[0]?.failureMessage },
  ]);
  owner = createWorkspaceLspRuntimeOwner(new LspManager(config, root));
  await expect(owner.runtime.waitUntilReadyForFile(file)).resolves.toMatchObject({
    kind: "unavailable",
  });
  expect(owner.runtime.getProjectServers()).toMatchObject([
    {
      status: "error",
      typescript: { backend: "native", packageName: "typescript", compilerVersion: "7.0.2" },
      failureMessage: expect.stringContaining("Repair/install the selected TypeScript package"),
    },
  ]);
});

it("routes and synchronizes native TSX/JSX and module suffixes", async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "supi-ts7-variants-")));
  fs.mkdirSync(path.join(root, "node_modules"));
  fs.symlinkSync(native, path.join(root, "node_modules/typescript"), "dir");
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { allowJs: true, checkJs: true, jsx: "preserve", noEmit: true },
      include: ["**/*"],
    }),
  );
  const typescript = loadConfig(root, { homeDir: path.join(root, "home") }).servers.typescript;
  if (!typescript) throw new Error("Missing TypeScript route");
  owner = createWorkspaceLspRuntimeOwner(new LspManager({ servers: { typescript } }, root));
  const runtime = owner.runtime;
  for (const extension of ["tsx", "jsx", "mts", "cts", "mjs", "cjs"]) {
    const file = path.join(root, `source.${extension}`);
    const jsx = extension.endsWith("sx") ? "\nexport const view = <div />;\n" : "\n";
    fs.writeFileSync(file, `export let value = 1;${jsx}`);
    expect(await runtime.waitUntilReadyForFile(file)).toMatchObject({ kind: "ready" });
    expect(JSON.stringify(await runtime.hover(file, { line: 0, character: 12 }))).toContain(
      "value: number",
    );
    fs.writeFileSync(file, `export let value = "edited";${jsx}`);
    expect(JSON.stringify(await runtime.hover(file, { line: 0, character: 12 }))).toContain(
      "value: string",
    );
  }
  expect(runtime.getProjectServers()).toMatchObject([{ typescript: { backend: "native" } }]);
}, 30_000);
