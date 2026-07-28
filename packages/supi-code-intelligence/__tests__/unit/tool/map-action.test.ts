import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeOrientationTool } from "../../../src/tool/orientation/execute.ts";
import { makeTestCtx } from "../../helpers/execute-action.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "orientation-facts-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relativePath: string, content: string): void {
  const fullPath = path.join(tmpDir, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf-8");
}

describe("directory Orientation facts", () => {
  it("lists only direct filesystem entries without extension or landmark classifications", async () => {
    writeFile("package.json", JSON.stringify({ name: "root" }));
    writeFile("src/app.ts", "export const app = 1;");
    writeFile("src/lib/util.ts", "export const util = 2;");
    writeFile("src/README.md", "# Source notes");

    const result = await executeOrientationTool({ focus: { path: "src" } }, makeTestCtx(tmpDir));

    expect(result.content).toContain("## Direct regular files");
    expect(result.content).toContain("`app.ts`");
    expect(result.content).toContain("`README.md`");
    expect(result.content).toContain("## Direct directories");
    expect(result.content).toContain("`lib/`");
    expect(result.content).not.toContain("TypeScript");
    expect(result.content).not.toContain("Landmark files");
    expect(result.content).not.toContain("Public Surfaces");
    expect(result.content).not.toContain("util.ts");
  });

  it("discloses exact direct-entry omissions in Markdown and structured details", async () => {
    writeFile("package.json", JSON.stringify({ name: "root" }));
    writeFile("src/a.txt", "");
    writeFile("src/b.txt", "");
    writeFile("src/c.txt", "");

    const result = await executeOrientationTool(
      { focus: { path: "src" }, maxResults: 2 },
      makeTestCtx(tmpDir),
    );
    const details = result.details as {
      data?: { sections?: Array<{ key: string; evidenceLists: Array<Record<string, unknown>> }> };
    };

    expect(result.content).toContain("showing 2 of 3; 1 omitted");
    expect(details.data?.sections).toContainEqual(
      expect.objectContaining({
        key: "filesystem.files",
        evidenceLists: [expect.objectContaining({ totalCount: 3, shownCount: 2, omittedCount: 1 })],
      }),
    );
  });

  it("labels workspace packages with their configuration provenance", async () => {
    writeFile("package.json", JSON.stringify({ name: "root" }));
    writeFile("pnpm-workspace.yaml", "packages:\n  - packages/*\n");
    writeFile("packages/app/package.json", JSON.stringify({ name: "@test/app" }));

    const result = await executeOrientationTool({}, makeTestCtx(tmpDir));
    const details = result.details as {
      data?: { sections?: Array<{ key: string; provenance: Array<Record<string, unknown>> }> };
    };

    expect(result.content).toContain("Configuration-declared packages");
    expect(result.content).toContain("configuration `pnpm-workspace.yaml#packages`");
    expect(details.data?.sections).toContainEqual(
      expect.objectContaining({
        key: "topology.packages",
        provenance: [
          expect.objectContaining({
            source: "configuration",
            detail: "pnpm-workspace.yaml#packages",
          }),
        ],
      }),
    );
  });

  it("keeps a focused path usable when package topology is partial", async () => {
    writeFile("package.json", JSON.stringify({ name: "root", workspaces: ["packages/*"] }));
    writeFile("packages/valid/package.json", JSON.stringify({ name: "@test/valid" }));
    writeFile("packages/valid/src/index.ts", "export const value = 1;");
    writeFile("packages/broken/package.json", "{ invalid");

    const result = await executeOrientationTool(
      { focus: { path: "packages/valid/src" } },
      makeTestCtx(tmpDir),
    );

    expect(result.content).toContain("`index.ts`");
    expect(result.content).toContain("## Package topology");
    expect(result.content).toContain("status: partial");
    expect(result.content).toContain("filesystem-error");
  });

  it("keeps focused filesystem facts when package metadata cannot be parsed", async () => {
    writeFile("package.json", "{ invalid");
    writeFile("src/index.ts", "export const value = 1;");

    const result = await executeOrientationTool({ focus: { path: "src" } }, makeTestCtx(tmpDir));

    expect(result.content).toContain("`index.ts`");
    expect(result.content).toContain("## Package topology");
    expect(result.content).toContain("status: unavailable");
    expect(result.content).not.toContain("No recognized source files");
    expect(result.content).not.toContain("No structured modules");
  });
});
