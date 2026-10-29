import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, expect, it } from "vitest";
import { loadConfig } from "../../src/config/config.ts";
import { LspManager } from "../../src/manager/manager.ts";
import { createWorkspaceLspRuntimeOwner } from "../../src/session/runtime-registry.ts";

const require = createRequire(import.meta.url);
const wrapper = path.dirname(require.resolve("@typescript/typescript6/package.json"));
const ordinary = path.dirname(require.resolve("typescript/package.json"));
let root: string | undefined;
let owner: ReturnType<typeof createWorkspaceLspRuntimeOwner> | undefined;
afterEach(async () => {
  await owner?.shutdown();
  owner = undefined;
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
});

// Required (not skipped): the Linux/macOS qualification gate supplies pinned TLS,
// wrapper, and underlying compiler installations through the workspace lockfile.
it("retries fresh package paths, starts the real wrapper, and confirms diagnostics clean after an edit", async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "supi-ts6-wrapper-")));
  fs.mkdirSync(path.join(root, "node_modules"));
  fs.mkdirSync(path.join(root, "broken"));
  fs.writeFileSync(
    path.join(root, "broken/package.json"),
    JSON.stringify({ name: "typescript", version: "8.0.2" }),
  );
  const link = path.join(root, "node_modules/typescript");
  fs.symlinkSync(path.join(root, "broken"), link, "dir");
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, target: "ES2022" },
      include: ["*.ts"],
    }),
  );
  const file = path.join(root, "index.ts");
  fs.writeFileSync(file, 'export const answer: number = "wrong";\n');
  const config = loadConfig(root, { homeDir: path.join(root, "home") });
  const typescript = config.servers.typescript;
  if (!typescript) throw new Error("Missing TypeScript route");
  const manager = new LspManager({ servers: { typescript } }, root);
  owner = createWorkspaceLspRuntimeOwner(manager);
  const runtime = owner.runtime;

  // Lazy routing must refuse unknown native majors rather than silently finding TS6 elsewhere.
  await expect(runtime.waitUntilReadyForFile(file)).resolves.toMatchObject({ kind: "unavailable" });
  expect(runtime.getProjectServers()).toMatchObject([
    {
      status: "error",
      failureMessage: expect.stringContaining("Unsupported automatic TypeScript backend"),
    },
  ]);

  fs.unlinkSync(link);
  fs.symlinkSync(wrapper, link, "dir");
  await expect(
    runtime.waitUntilReadyForFile(file, { retryFailedRoute: true, timeoutMs: 20_000 }),
  ).resolves.toMatchObject({ kind: "ready" });
  expect(runtime.getProjectServers()).toMatchObject([
    {
      status: "running",
      typescript: {
        backend: "tsserver",
        packageName: "typescript",
        wrapperVersion: "6.0.2",
        compilerVersion: "6.0.3",
      },
    },
  ]);
  const hover = await runtime.hover(file, { line: 0, character: 14 });
  expect(hover.kind).toBe("completed");
  expect(JSON.stringify(hover)).toContain("answer: number");
  const errors = await runtime.fileDiagnostics(file);
  expect(errors.kind).toBe("completed");
  if (errors.kind !== "completed") throw new Error("Expected confirmed diagnostics");
  expect(errors.data).toContainEqual(
    expect.objectContaining({ severity: 1, message: expect.stringContaining("not assignable") }),
  );
  fs.writeFileSync(file, "export const answer: number = 42;\n");
  await expect(runtime.fileDiagnostics(file)).resolves.toMatchObject({
    kind: "completed",
    data: [],
  });

  // Disk changes do not hot-swap a healthy client. A real restart must re-resolve.
  fs.unlinkSync(link);
  fs.symlinkSync(ordinary, link, "dir");
  await runtime.hover(file, { line: 0, character: 14 });
  expect(runtime.getProjectServers()[0]?.typescript?.wrapperVersion).toBe("6.0.2");
  expect(await manager.restartClientsForFiles([file])).toMatchObject([{ restarted: true }]);
  expect(runtime.getProjectServers()[0]?.typescript).toEqual({
    backend: "tsserver",
    packageName: "typescript",
    compilerVersion: "6.0.3",
  });
  await owner.shutdown();
  expect(runtime.getProjectServers()).toEqual([]);
}, 60_000);
