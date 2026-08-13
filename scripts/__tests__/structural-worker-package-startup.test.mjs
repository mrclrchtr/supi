import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { packStaged } from "../pack-staged.mjs";

const workspace = resolve(import.meta.dirname, "../..");
const scratch = mkdtempSync(join(tmpdir(), "supi-worker-package-"));
const output = join(scratch, "packs");
let stagedTree;
let stagedBundledTree;

beforeAll(async () => {
  mkdirSync(output, { recursive: true });
  const treeTarball = await packStaged(join(workspace, "packages/supi-tree-sitter"), {
    outDir: output,
  });
  const ciTarball = await packStaged(join(workspace, "packages/supi-code-intelligence"), {
    outDir: output,
  });
  stagedTree = extract(treeTarball, join(scratch, "tree"));
  stagedBundledTree = join(
    extract(ciTarball, join(scratch, "ci")),
    "node_modules/@mrclrchtr/supi-tree-sitter",
  );
}, 120_000);

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("Structural Worker package startup", () => {
  it.each([
    ["workspace", join(workspace, "packages/supi-tree-sitter")],
    ["staged standalone", () => stagedTree],
    ["staged bundled", () => stagedBundledTree],
  ])(
    "starts the real Worker from %s",
    async (_label, packageRoot) => {
      const root = typeof packageRoot === "function" ? packageRoot() : packageRoot;
      expect(existsSync(join(root, "src/worker/bootstrap.mjs"))).toBe(true);
      if (_label !== "workspace") {
        expect(existsSync(join(root, "node_modules/jiti/lib/jiti.mjs"))).toBe(true);
        expect(existsSync(join(root, "node_modules/web-tree-sitter/web-tree-sitter.wasm"))).toBe(
          true,
        );
      }
      expect(
        existsSync(join(root, "resources/grammars/typescript/tree-sitter-typescript.wasm")),
      ).toBe(true);

      const fixture = join(scratch, `probe-${Math.random().toString(16).slice(2)}.ts`);
      writeFileSync(fixture, "export const packageWorker = 1;\n");
      const worker = new Worker(new URL(`file://${join(root, "src/worker/bootstrap.mjs")}`), {
        execArgv: [],
        workerData: { cwd: dirname(fixture), generation: 1 },
      });
      try {
        await expect(requestCanParse(worker, fixture)).resolves.toEqual(
          expect.objectContaining({
            kind: "success",
            data: expect.objectContaining({ language: "typescript" }),
          }),
        );
      } finally {
        await worker.terminate();
      }
    },
    30_000,
  );
});

function extract(tarball, target) {
  mkdirSync(target, { recursive: true });
  execFileSync("tar", ["-xzf", tarball, "-C", target]);
  return join(target, "package");
}

function requestCanParse(worker, file) {
  return new Promise((resolveResult, reject) => {
    const requestId = "package-probe";
    const chunks = [];
    worker.once("error", reject);
    worker.on("message", (message) => {
      if (message.kind === "ready") {
        worker.postMessage({
          kind: "request",
          version: 1,
          generation: 1,
          requestId,
          input: { operation: "canParse", file },
          cancellationFlag: new SharedArrayBuffer(4),
        });
      } else if (message.kind === "chunk" && message.requestId === requestId) {
        chunks.push(Buffer.from(message.payload));
        worker.postMessage({
          kind: "chunk-ack",
          version: 1,
          generation: 1,
          requestId,
          sequence: message.sequence,
        });
      } else if (message.kind === "terminal" && message.requestId === requestId) {
        resolveResult(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } else if (message.kind === "startup-failure") {
        reject(new Error(message.message));
      }
    });
  });
}
