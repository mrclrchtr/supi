import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeAction } from "../src/tool-actions.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-pattern-structured-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("pattern structured search", () => {
  it("returns definition-oriented results without imports or comments", async () => {
    const srcDir = path.join(tmpDir, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(
      path.join(srcDir, "payments.tsx"),
      [
        'import { createServerFn } from "@tanstack/react-start";',
        "// createServerFn is used below",
        'export const paymentLoader = createServerFn({ method: "GET" });',
        "export function PaymentCard() {",
        "  return null;",
        "}",
      ].join("\n"),
    );

    const result = await executeAction(
      {
        action: "pattern",
        pattern: "Payment|payment",
        regex: true,
        kind: "definition",
        path: "src",
      },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("Pattern Definitions");
    expect(result.content).toContain("paymentLoader");
    expect(result.content).toContain("PaymentCard");
    expect(result.content).not.toContain("@tanstack/react-start");
    expect(result.content).not.toContain("used below");
  });

  it("returns export-only results for TSX files", async () => {
    const srcDir = path.join(tmpDir, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(
      path.join(srcDir, "payments.tsx"),
      [
        'import { createServerFn } from "@tanstack/react-start";',
        'export const paymentLoader = createServerFn({ method: "GET" });',
        "export function PaymentCard() {",
        "  return null;",
        "}",
      ].join("\n"),
    );

    const result = await executeAction(
      { action: "pattern", pattern: "payment", kind: "export", path: "src" },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("Pattern Exports");
    expect(result.content).toContain("paymentLoader");
    expect(result.content).toContain("PaymentCard");
    expect(result.content).not.toContain("@tanstack/react-start");
  });

  it("warns when structured scans are capped", async () => {
    const srcDir = path.join(tmpDir, "src");
    mkdirSync(srcDir, { recursive: true });
    for (let i = 0; i < 205; i++) {
      writeFileSync(path.join(srcDir, `file${i}.ts`), `export const target${i} = ${i};\n`);
    }

    const result = await executeAction(
      { action: "pattern", pattern: "target", kind: "definition", path: "src" },
      { cwd: tmpDir },
    );

    expect(result.content).toContain("Partial structured results");
    expect(result.details?.type).toBe("search");
    if (result.details?.type === "search") {
      expect(result.details.data.omittedCount).toBeGreaterThan(0);
    }
  });
});
