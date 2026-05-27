import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildArchitectureModel } from "@mrclrchtr/supi-code-intelligence/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateFocusedBrief } from "../../src/brief.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-brief-recursive-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeJson(dir: string, file: string, data: unknown) {
  writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2));
}

describe("recursive directory briefs", () => {
  it("summarizes descendant structure for nested non-module directories", async () => {
    writeJson(tmpDir, "package.json", { name: "test-ws" });
    writeFileSync(path.join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");

    const appDir = path.join(tmpDir, "packages", "app");
    const featuresDir = path.join(appDir, "src", "features", "payments");
    mkdirSync(path.join(featuresDir, "components"), { recursive: true });
    mkdirSync(path.join(featuresDir, "lib"), { recursive: true });
    mkdirSync(path.join(featuresDir, "data-access"), { recursive: true });

    writeJson(appDir, "package.json", {
      name: "@t/app",
      pi: { extensions: ["./src/index.ts"] },
    });
    writeFileSync(path.join(appDir, "src", "index.ts"), "export default function () {}\n");
    writeFileSync(
      path.join(featuresDir, "components", "PaymentCard.tsx"),
      "export function PaymentCard() { return null; }\n",
    );
    writeFileSync(
      path.join(featuresDir, "lib", "usePayment.ts"),
      [
        'import { PaymentCard } from "../components/PaymentCard";',
        "export function usePayment() {",
        "  return PaymentCard;",
        "}",
      ].join("\n"),
    );
    writeFileSync(
      path.join(featuresDir, "data-access", "queries.ts"),
      "export const paymentQuery = 'payments';\n",
    );

    const model = await buildArchitectureModel(tmpDir);
    const { content } = await generateFocusedBrief(
      model as NonNullable<typeof model>,
      featuresDir,
      { provider: null, cwd: tmpDir },
    );

    expect(content).toContain("Inside module: app");
    expect(content).toContain("Descendant Source Files");
    expect(content).toContain("components/");
    expect(content).toContain("lib/");
    expect(content).toContain("data-access/");
    expect(content).toContain("Public Surfaces");
    expect(content).toContain("PaymentCard");
    expect(content).toContain("Import / Export Summary");
    expect(content).not.toContain("No recognized source files in this directory.");
  });

  it("respects maxResults for source file listing", async () => {
    const appDir = path.join(tmpDir, "packages", "app");
    mkdirSync(appDir, { recursive: true });
    writeJson(tmpDir, "package.json", { name: "test" });
    writeJson(appDir, "package.json", { name: "@t/app" });
    // Add multiple source files
    for (let i = 0; i < 15; i++) {
      writeFileSync(path.join(appDir, `file${i}.ts`), `export const x${i} = ${i};\n`);
    }

    const model = await buildArchitectureModel(tmpDir);
    const { content: capped } = await generateFocusedBrief(
      model as NonNullable<typeof model>,
      appDir,
      { provider: null, cwd: tmpDir, maxResults: 5 },
    );

    expect(capped).toContain("## Source Files");
    // Source Files section should show at most 5 files due to maxResults=5
    const beforePublic = capped.split("## Public Surfaces")[0];
    const sectionMatches = beforePublic.match(/`file\d+\.ts`/g);
    expect(sectionMatches).not.toBeNull();
    expect(sectionMatches?.length).toBeLessThanOrEqual(5);
    expect(capped).toContain("more files");
  });
});
