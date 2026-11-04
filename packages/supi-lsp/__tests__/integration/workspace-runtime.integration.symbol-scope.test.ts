import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileToUri } from "@mrclrchtr/supi-core/path";
import { LspRuntimeController, type WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import { afterEach, describe, expect, it } from "vitest";
import { disabledDefaultServers } from "../helpers/disabled-default-servers.ts";

const FIXTURE = path.resolve(import.meta.dirname, "../fixtures/lsp-semantic-server.mjs");

describe("public WorkspaceLspRuntime scoped symbol completeness", () => {
  let cwd: string;
  let source: string;
  let generated: string;
  let other: string;
  let symbolsFile: string;
  let controller: LspRuntimeController;
  let runtime: WorkspaceLspRuntime;

  function write(file: string): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "function work() {}\n");
  }

  function setResults(uris: string[]): void {
    fs.writeFileSync(
      symbolsFile,
      JSON.stringify(
        uris.map((uri) => ({
          name: "work",
          kind: 12,
          location: {
            uri,
            range: {
              start: { line: 0, character: 9 },
              end: { line: 0, character: 13 },
            },
          },
        })),
      ),
    );
  }

  async function start(failedRoute = false): Promise<void> {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-symbol-scope-"));
    source = path.join(cwd, "src", "source.test");
    generated = path.join(cwd, "dist", "generated.test");
    other = path.join(cwd, "other", "other.test");
    symbolsFile = path.join(cwd, "symbols.json");
    for (const file of [source, generated, other]) write(file);
    setResults([fileToUri(source), fileToUri(generated), fileToUri(other)]);
    fs.writeFileSync(path.join(cwd, "project.marker"), "");
    fs.mkdirSync(path.join(cwd, ".pi", "supi"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".pi", "supi", "config.json"),
      JSON.stringify({
        lsp: {
          servers: {
            ...disabledDefaultServers(cwd),
            fixture: {
              command: process.execPath,
              args: [
                FIXTURE,
                path.join(cwd, "protocol.log"),
                "0",
                "pull",
                `--workspace-symbol-results=${symbolsFile}`,
              ],
              fileTypes: ["test"],
              rootMarkers: ["project.marker"],
            },
            ...(failedRoute
              ? {
                  failing: {
                    command: process.execPath,
                    args: [FIXTURE, path.join(cwd, "failed.log"), "0", "--workspace-symbol-error"],
                    fileTypes: ["broken"],
                    rootMarkers: ["project.marker"],
                  },
                }
              : {}),
          },
        },
      }),
    );
    controller = new LspRuntimeController(cwd);
    const started = await controller.start();
    if (started.kind !== "ready") throw new Error(`Fixture did not start: ${started.kind}`);
    runtime = started.runtime;
    await expect(runtime.trackFile(source)).resolves.toBe(true);
    await expect(runtime.waitUntilReadyForFile(source)).resolves.toMatchObject({ kind: "ready" });
    if (failedRoute) {
      const file = path.join(cwd, "failed.broken");
      write(file);
      await expect(runtime.trackFile(file)).resolves.toBe(true);
      await expect(runtime.waitUntilReadyForFile(file)).resolves.toMatchObject({ kind: "ready" });
    }
  }

  afterEach(async () => {
    await controller?.shutdown();
    if (cwd) fs.rmSync(cwd, { recursive: true, force: true });
  });

  it.each(["file", "directory"])(
    "does not taint a source %s scope with excluded siblings",
    async (kind) => {
      await start();
      const scope = kind === "file" ? source : path.dirname(source);
      await expect(runtime.workspaceSymbol("work", undefined, [scope])).resolves.toMatchObject({
        kind: "completed",
        data: [{ location: { uri: fileToUri(source) } }, { location: { uri: fileToUri(other) } }],
      });
    },
  );

  it.each(["unscoped", "broad", "multiple"])("retains exclusions for %s requests", async (kind) => {
    await start();
    const scopes =
      kind === "unscoped" ? undefined : kind === "broad" ? [cwd] : [path.dirname(source), cwd];
    await expect(runtime.workspaceSymbol("work", undefined, scopes)).resolves.toMatchObject({
      kind: "partial",
      metadata: { automaticPathExclusion: { excludedCount: 1 } },
    });
  });

  it.each(["file", "directory"])(
    "keeps an explicitly selected excluded %s inspectable",
    async (kind) => {
      await start();
      const scope = kind === "file" ? generated : path.dirname(generated);
      await expect(runtime.workspaceSymbol("work", undefined, [scope])).resolves.toMatchObject({
        kind: "completed",
        data: [
          { location: { uri: fileToUri(source) } },
          { location: { uri: fileToUri(generated) } },
          { location: { uri: fileToUri(other) } },
        ],
      });
    },
  );

  it.each(["outside-alias", "inside-alias", "missing", "non-file"])(
    "does not discard a possibly relevant %s exclusion",
    async (kind) => {
      await start();
      let excluded = generated;
      if (kind === "inside-alias") {
        excluded = path.join(cwd, "src", "dist", "alias.test");
        fs.mkdirSync(path.dirname(excluded));
        fs.symlinkSync(other, excluded);
      } else if (kind === "outside-alias") {
        fs.unlinkSync(excluded);
        fs.symlinkSync(source, excluded);
      } else if (kind === "missing") fs.unlinkSync(excluded);
      setResults([
        fileToUri(source),
        kind === "non-file" ? "vfs:/dist/generated.test" : fileToUri(excluded),
      ]);
      await expect(
        runtime.workspaceSymbol("work", undefined, [path.dirname(source)]),
      ).resolves.toMatchObject({
        kind: "partial",
        metadata: { automaticPathExclusion: { excludedCount: 1 } },
      });
    },
  );

  it("retains a contributing route failure even when policy exclusions are outside scope", async () => {
    await start(true);
    await expect(
      runtime.workspaceSymbol("work", undefined, [path.dirname(source)]),
    ).resolves.toMatchObject({
      kind: "partial",
      reason: expect.stringContaining("Workspace-symbol retry failed"),
    });
  });

  it("does not mistake a sibling path prefix for containment or infer from capped examples", async () => {
    await start();
    const outside = Array.from({ length: 6 }, (_, index) =>
      path.join(cwd, "src-other", "dist", `outside-${index}.test`),
    );
    for (const file of outside) write(file);
    const inside = path.join(cwd, "src", "dist", "inside.test");
    write(inside);
    // More distinct outside paths than the example cap, then one relevant exclusion.
    setResults([fileToUri(source), ...outside.map(fileToUri)]);
    await expect(
      runtime.workspaceSymbol("work", undefined, [path.dirname(source)]),
    ).resolves.toMatchObject({ kind: "completed" });
    setResults([fileToUri(source), ...outside.map(fileToUri), fileToUri(inside)]);
    await expect(
      runtime.workspaceSymbol("work", undefined, [path.dirname(source)]),
    ).resolves.toMatchObject({
      kind: "partial",
      metadata: {
        automaticPathExclusion: { excludedCount: 1, examples: ["src/dist/inside.test"] },
      },
    });
  });
});
