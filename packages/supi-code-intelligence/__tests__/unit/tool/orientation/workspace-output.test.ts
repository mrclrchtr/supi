import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import extension from "../../../../src/extension.ts";
import { collectOverview } from "../../../../src/overview/collect.ts";

let root: string;
let home: string;
const captures = new Set<string>();
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "orientation-output-"));
  home = mkdtempSync(join(tmpdir(), "orientation-home-"));
});
afterEach(() => {
  for (const directory of [root, home, ...captures])
    rmSync(directory, { recursive: true, force: true });
  captures.clear();
});
function put(file: string, text: string) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}
async function orient(input: object = {}) {
  const pi = createPiMock();
  extension(pi as never, undefined, home);
  const result = (await getTool(pi, "code_orientation").execute(
    "workspace-output",
    input,
    undefined,
    undefined,
    makeCtx({ cwd: root }),
  )) as { content: Array<{ type: string; text: string }> };
  return result.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function capturedDetails(text: string): string | undefined {
  const snapshot = text.match(/Captured details[^`]*`([^`]+)`/)?.[1];
  if (snapshot) captures.add(dirname(snapshot));
  return snapshot;
}

async function overview() {
  const output = await collectOverview(root, true, home);
  expect(output).not.toBeNull();
  if (!output) throw new Error("Expected a workspace Overview");
  capturedDetails(output.content);
  return output;
}

describe("workspace Overview captures", () => {
  it("does not link a raw inventory dump when navigation and descriptions fit inline", async () => {
    put("package.json", JSON.stringify({ name: "example", description: "A small project" }));
    put("src/main.py", "pass\n");
    const output = await overview();

    expect(output.content).toContain("A small project");
    expect(output.data.omittedCount).toBe(0);
    expect(capturedDetails(output.content)).toBeUndefined();
  });

  it("does not claim descriptions were omitted merely because names exceed the soft budget", async () => {
    for (let index = 0; index < 20; index++) {
      put(
        `units/p${String(index).padStart(2, "0")}/package.json`,
        JSON.stringify({ name: `package-${index}-${"name".repeat(45)}` }),
      );
    }
    const output = await overview();

    expect(output.warning?.surface).toBe("overview");
    expect(output.data.omittedCount).toBe(0);
    expect(output.content).not.toContain("Declared descriptions are omitted");
    expect(capturedDetails(output.content)).toBeUndefined();
  });

  it("links omitted navigation rows with a concise snapshot disclaimer", async () => {
    for (let index = 0; index < 6; index++) put(`file-${index}.txt`, "");
    const output = await overview();
    const snapshot = capturedDetails(output.content);

    expect(output.content).toContain("showing 5 of 6; 1 omitted");
    expect(output.content).toContain(`Captured details (not a fresh scan): \`${snapshot}\`.`);
    expect(output.content).not.toContain("Reading it does not refresh the observation");
    expect(snapshot).toBeDefined();
    expect(readFileSync(snapshot as string, "utf8")).toContain('"path": "file-5.txt"');
  });

  it("links omitted descriptions even when no navigation rows are omitted", async () => {
    const description = "Declared project explanation. ".repeat(300);
    put("package.json", JSON.stringify({ name: "example", description }));
    const output = await overview();
    const snapshot = capturedDetails(output.content);

    expect(output.data.omittedCount).toBe(0);
    expect(output.content).toContain("Declared descriptions are omitted");
    expect(snapshot).toBeDefined();
    expect(readFileSync(snapshot as string, "utf8")).toContain(description.trimEnd());
  });

  it("retains explicit recovery guidance when the hard cap removes the inline map", async () => {
    const name = "oversized-project-".repeat(1000);
    put("package.json", JSON.stringify({ name }));
    const output = await overview();
    const snapshot = capturedDetails(output.content);

    expect(output.content).toContain("Read the complete captured result.");
    expect(output.content).not.toContain("## Direct files");
    expect(output.content.length).toBeLessThanOrEqual(8000);
    expect(snapshot).toBeDefined();
    expect(readFileSync(snapshot as string, "utf8")).toContain(name);
  });
});

describe("workspace Orientation output", () => {
  it("keeps literal path spacing and distinguishes encoded declaration values", async () => {
    put("two  spaces.txt", "");
    put("a&b.txt", "");
    put("package.json", JSON.stringify({ name: "odd|name" }));
    const text = await orient();
    expect(text).toContain("`two  spaces.txt`");
    expect(text).toContain("`a&b.txt`");
    // biome-ignore lint/security/noSecrets: Expected JSON escape text, not a secret.
    expect(text).toContain('`"odd\\u007cname"` (JSON string)');
  });

  it("captures omitted mixed-language declarations without inventing membership", async () => {
    put("package.json", JSON.stringify({ name: "root", workspaces: ["units/*"] }));
    put("units/app/package.json", JSON.stringify({ name: "app" }));
    put(
      "service/pyproject.toml",
      ["[project]", 'name = "api"', 'description = "Data service"', ""].join("\n"),
    );
    const text = await orient({ maxResults: 1 });
    const snapshot = capturedDetails(text);
    expect(snapshot).toBeDefined();
    const captured = readFileSync(snapshot as string, "utf8");
    expect(captured).toContain("python-project");
    expect(captured).toContain("project.name");
    expect(captured).toContain("Data service");
    expect(captured).toContain("units/app");
    expect(captured).not.toMatch(/service.*node-workspace/);
    rmSync(dirname(snapshot as string), { recursive: true, force: true });
  });

  it("defers directory metadata while capturing dependency categories and instructions intact", async () => {
    put("package.json", JSON.stringify({ name: "root", workspaces: ["units/*"] }));
    put(
      "units/app/package.json",
      JSON.stringify({
        name: "app",
        dependencies: { core: "workspace:*" },
        devDependencies: { core: "workspace:*" },
      }),
    );
    put("units/core/package.json", JSON.stringify({ name: "core" }));
    put("units/app/CLAUDE.md", "Keep caller data private.\n");
    put("units/app/fixtures/example/go.mod", "module example.com/fixture\ngo 1.23\n");
    const text = await orient({ focus: { path: "units/app" } });
    expect(text).toContain("Project: `app`");
    expect(text).toContain("## Direct directories");
    expect(text).toContain("## Direct files");
    expect(text).toContain("Keep caller data private.");
    expect(text).toContain("## Captured navigation");
    expect(text).toContain("omitted");
    expect(text).not.toContain("```mermaid");
    expect(text).not.toContain("## Project declarations");
    expect(text).not.toContain("## File extensions");
    const snapshot = capturedDetails(text);
    expect(snapshot).toBeDefined();
    const captured = readFileSync(snapshot as string, "utf8");
    expect(captured).toContain("```mermaid");
    expect(captured).toContain("dependencies: workspace:*");
    expect(captured).toContain("devDependencies: workspace:*");
    expect(captured.match(/ -->/g)).toHaveLength(2);
    expect(captured).toContain("example.com/fixture");
    expect(captured).toContain("Keep caller data private.");
    expect(captured).toContain('"inventory"');
  });

  it("keeps incomplete ancillary observations and collection problems inline", async () => {
    put("units/app/package.json", JSON.stringify({ name: "app" }));
    put("units/app/fixtures/broken/package.json", "{ invalid json");
    const text = await orient({ focus: { path: "units/app" } });
    expect(text).toContain("## Collection limits");
    expect(text).toContain("## Project declarations");
    expect(text).toContain("Metadata collection is incomplete");
    expect(text).toContain("fixtures/broken/package.json");
    const snapshot = capturedDetails(text);
    expect(snapshot).toBeDefined();
  });

  it("bounds large declarations and retains the complete captured text", async () => {
    put(
      "package.json",
      JSON.stringify({ name: "root", description: "Long description ".repeat(3000) }),
    );
    const text = await orient();
    expect(text.length).toBeLessThanOrEqual(16000);
    const snapshot = capturedDetails(text);
    expect(snapshot).toBeDefined();
    expect(readFileSync(snapshot as string, "utf8")).toContain("Long description ".repeat(1000));
    rmSync(dirname(snapshot as string), { recursive: true, force: true });
  });

  it("orients a source-only project without requiring Node metadata", async () => {
    put("nested/source/main.py", "pass\n");
    const text = await orient();
    expect(text).toContain("1 regular file");
    expect(text).toContain(".py");
    expect(text).toContain("nested/");
    expect(text).not.toContain("No package.json");
    expect(text).not.toContain("Package topology");
  });
});
