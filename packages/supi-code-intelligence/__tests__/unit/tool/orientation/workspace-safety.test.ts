import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import extension from "../../../../src/extension.ts";

let root: string;
let home: string;
const captures = new Set<string>();
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "orientation-safety-"));
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
function create() {
  const pi = createPiMock();
  extension(pi as never, undefined, home);
  return pi;
}
async function orient(pi: ReturnType<typeof createPiMock>, input: object = {}) {
  const result = (await getTool(pi, "code_orientation").execute(
    "safety",
    input,
    undefined,
    undefined,
    makeCtx({ cwd: root }),
  )) as { content: Array<{ type: string; text: string }>; details: unknown };
  const text = result.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  const snapshot = text.match(/Captured details[^`]*`([^`]+)`/)?.[1];
  if (snapshot) captures.add(dirname(snapshot));
  return { result, text, snapshot };
}

describe("public workspace output safety", () => {
  it("collects the explicit directory before unrelated files exhaust the inventory cap", async () => {
    for (let index = 0; index < 10001; index++) put(`aaa/${index}.txt`, "");
    put("zzz/unique.py", "pass\n");
    const { text } = await orient(create(), { focus: { path: "zzz" } });
    expect(text).toContain("unique.py");
    expect(text).toContain("entry-limit");
  }, 20000);

  it("rejects an external focus below a symbolic-link ancestor", async () => {
    const external = mkdtempSync(join(tmpdir(), "orientation-external-"));
    captures.add(external);
    mkdirSync(join(external, "actual", "leaf"), { recursive: true });
    writeFileSync(join(external, "actual", "leaf", "outside.py"), "pass\n");
    symlinkSync(join(external, "actual"), join(external, "alias"));
    await expect(
      orient(create(), { focus: { path: join(external, "alias", "leaf") } }),
    ).rejects.toThrow(/symbolic.link/i);
  });

  it("retains exclusions and unmatched workspace patterns in the captured result", async () => {
    put(
      "pnpm-workspace.yaml",
      ["packages:", "  - units/*", "  - '!units/skip'", "  - absent/*", ""].join("\n"),
    );
    put("units/app/package.json", JSON.stringify({ name: "app" }));
    const { snapshot } = await orient(create());
    const captured = readFileSync(snapshot as string, "utf8");
    expect(captured).toContain('"!units/skip"');
    expect(captured).toContain('"absent/*"');
  });

  it("keeps unread instruction text eligible for a later request", async () => {
    const content = "Keep fields literal. ".repeat(6000);
    put("notes/CLAUDE.md", content);
    const pi = create();
    for (let index = 0; index < 2; index++) {
      const { result, text, snapshot } = await orient(pi, { focus: { path: "notes" } });
      expect(Buffer.byteLength(text)).toBeLessThan(50 * 1024);
      expect(text).toContain("Instruction file truncated to 0 of 1 lines");
      expect(text).toContain("Some instruction text was not supplied");
      expect(result.details).toMatchObject({ data: { instructions: { files: [] } } });
      expect(snapshot).toBeDefined();
      expect(readFileSync(snapshot as string, "utf8")).toContain(content.trimEnd());
    }
  });

  it("captures raw declarations and inventory without refreshing them", async () => {
    put("package.json", JSON.stringify({ name: "example", dependencies: { external: "^1" } }));
    put("nested/first.txt", "first\n");
    const { snapshot } = await orient(create());
    expect(snapshot).toBeDefined();
    put("nested/later.txt", "later\n");
    put("package.json", JSON.stringify({ name: "changed" }));
    const captured = readFileSync(snapshot as string, "utf8");
    expect(captured).toContain('"path": "nested/first.txt"');
    expect(captured).toContain('"name": "external"');
    expect(captured).toContain('"value": "^1"');
    expect(captured).not.toContain("nested/later.txt");
    expect(captured).not.toContain('"name": "changed"');
    expect(statSync(snapshot as string).mode & 0o777).toBe(0o600);
  });

  it("does not bypass ignore rules for an empty root focus", async () => {
    execFileSync("git", ["init", "-q", root]);
    put(".gitignore", "*\n");
    put("hidden/package.json", JSON.stringify({ name: "hidden-project" }));
    const pi = create();
    const automatic = await orient(pi, { focus: { path: "." } });
    expect(automatic.text).not.toContain("hidden-project");
    const explicit = await orient(pi, { focus: { path: "hidden" } });
    expect(explicit.text).toContain("hidden-project");
    expect(explicit.text).toContain("including ignored paths");
    expect(explicit.text).toContain("hidden/package.json");
  });

  it("keeps the total navigation cap when maxResults is large", async () => {
    for (let index = 0; index < 150; index++) {
      put(
        `units/p${String(index).padStart(3, "0")}/package.json`,
        JSON.stringify({ name: `package-${index}-${"navigation".repeat(10)}` }),
      );
    }
    const pi = create();
    for (let index = 0; index < 2; index++) {
      const { text, snapshot } = await orient(pi, { maxResults: 10000 });
      expect(text.length).toBeLessThanOrEqual(16000);
      expect(text).toContain("package-0");
      expect(text).toMatch(/showing \d+ of 150; \d+ omitted/);
      expect(readFileSync(snapshot as string, "utf8")).toContain("package-149");
    }
  });
});
