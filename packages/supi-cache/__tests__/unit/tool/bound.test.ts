import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ForensicsResult } from "../../../src/forensics/forensics.ts";
import type { ForensicsFinding } from "../../../src/forensics/types.ts";
import { boundForensicsOutput } from "../../../src/tool/bound.ts";

function makeFinding(sessionId: string, index: number): ForensicsFinding {
  return {
    sessionId,
    turnIndex: index,
    previousRate: 50,
    currentRate: 30,
    drop: 20,
    cause: { type: "prompt_change" },
    toolsBefore: [
      {
        toolName: "read",
        paramKeys: ["path"],
        paramShapes: {
          path: { kind: "string", len: 10, multiline: false },
        },
      },
    ],
  };
}

function makeResult(findings: ForensicsFinding[]): ForensicsResult {
  return {
    pattern: "hotspots",
    findings,
    sessionsScanned: 12,
    turnsAnalyzed: 300,
  };
}

const query = { pattern: "hotspots", since: "7d", minDrop: 5, maxSessions: 100 };

describe("boundForensicsOutput", () => {
  it("returns serialized JSON unchanged when it fits both limits", () => {
    const result = makeResult([makeFinding("s1", 1)]);
    const output = boundForensicsOutput(result, query);

    expect(output.truncated).toBe(false);
    expect(output.fullOutputPath).toBeUndefined();
    expect(output.text).toBe(JSON.stringify(result, null, 2));
  });

  it("returns a summary envelope when the result exceeds the line limit", () => {
    const findings = Array.from({ length: 410 }, (_, i) => makeFinding(`session-${i}`, i));
    const result = makeResult(findings);
    const output = boundForensicsOutput(result, query);

    const full = JSON.stringify(result, null, 2);
    expect(full.split("\n").length).toBeGreaterThan(2_000);

    expect(output.truncated).toBe(true);
    expect(output.fullOutputPath).toBeDefined();
    expect(output.fullOutputPath).toMatch(/supi-cache-/);

    const parsed = JSON.parse(output.text) as Record<string, unknown>;
    expect(parsed.truncated).toBe(true);
    expect(parsed.fullOutputPath).toBe(output.fullOutputPath);
    expect(parsed.totalLines).toBe(full.split("\n").length);
    expect(parsed.totalBytes).toBe(Buffer.byteLength(full, "utf-8"));
    expect(parsed.maxLines).toBe(2_000);
    expect(parsed.maxBytes).toBe(51_200);
    expect(parsed.pattern).toBe("hotspots");
    expect(parsed.since).toBe("7d");
    expect(parsed.minDrop).toBe(5);
    expect(parsed.maxSessions).toBe(100);
    expect(parsed.sessionsScanned).toBe(12);
    expect(parsed.turnsAnalyzed).toBe(300);

    // The complete redacted JSON is readable at the spill path.
    expect(readFileSync(output.fullOutputPath!, "utf-8")).toBe(full);
  });

  it("returns a summary envelope when the result exceeds the byte limit", () => {
    const long = "λ".repeat(30_000);
    const findings = [makeFinding(long, 1), makeFinding(long, 2), makeFinding(long, 3)];
    const result = makeResult(findings);
    const output = boundForensicsOutput(result, query);

    const full = JSON.stringify(result, null, 2);
    expect(Buffer.byteLength(full, "utf-8")).toBeGreaterThan(51_200);
    // Few lines: the byte limit is the binding constraint.
    expect(full.split("\n").length).toBeLessThan(2_000);

    expect(output.truncated).toBe(true);
    const parsed = JSON.parse(output.text) as Record<string, unknown>;
    expect(parsed.totalBytes).toBe(Buffer.byteLength(full, "utf-8"));
    expect(readFileSync(output.fullOutputPath!, "utf-8")).toBe(full);
  });

  it("never returns a partial findings or breakdown array", () => {
    const findings = Array.from({ length: 410 }, (_, i) => makeFinding(`session-${i}`, i));
    const result = makeResult(findings);
    const output = boundForensicsOutput(result, query);

    const parsed = JSON.parse(output.text) as Record<string, unknown>;
    expect(parsed.findings).toBeUndefined();
    expect(parsed.breakdown).toBeUndefined();
    // The spill file is the only place the full data lives.
    expect(readFileSync(output.fullOutputPath!, "utf-8")).toBe(JSON.stringify(result, null, 2));
  });

  it("round-trips the exact result object through the spill file", () => {
    const findings = Array.from({ length: 410 }, (_, i) => makeFinding(`session-${i}`, i));
    const result = makeResult(findings);
    const output = boundForensicsOutput(result, query);

    expect(JSON.parse(readFileSync(output.fullOutputPath!, "utf-8"))).toEqual(result);
  });
});
