import { readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ForensicsResult } from "../../../../src/forensics/forensics.ts";
import type { ForensicsFinding } from "../../../../src/forensics/types.ts";
import {
  boundForensicsOutput,
  buildForensicsResult,
} from "../../../../src/tool/cache_forensics/result.ts";

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

const query = {
  pattern: "hotspots",
  since: "7d",
  minDrop: 5,
  maxSessions: 100,
  limit: 50,
} as const;

const spills = new Set<string>();
function readSpill(path: string | undefined): string {
  if (!path) throw new Error("Expected a spill reference");
  spills.add(dirname(path));
  return readFileSync(path, "utf-8");
}
afterEach(() => {
  for (const directory of spills) rmSync(directory, { recursive: true, force: true });
  spills.clear();
});

describe("cache_forensics result assembly", () => {
  it("returns serialized JSON unchanged when it fits both limits", () => {
    const result = makeResult([makeFinding("s1", 1)]);
    const output = boundForensicsOutput(result, query);

    expect(output.truncated).toBe(false);
    expect(output.fullOutputPath).toBeUndefined();
    expect(output.text).toBe(JSON.stringify(result, null, 2));
  });

  it.each([false, true])(
    "allowlists nested public facts and omits unavailable fields (spill=%s)",
    (spill) => {
      const sessionId = spill ? "λ".repeat(30_000) : "public-session-id";
      const source = {
        ...makeResult([]),
        _internal: "private-root",
        findings: [
          {
            ...makeFinding(sessionId, 2),
            previousRate: undefined,
            idleGapMinutes: undefined,
            missedTokens: 4000,
            missedCost: 0.123456789,
            modelChanged: false,
            cause: { type: "model_change" as const, model: "public-model", raw: "private-cause" },
            _pathsInvolved: ["private-path"],
            _commandSummaries: ["private-command"],
            internal: "private-finding",
            toolsBefore: [
              {
                toolName: "bash",
                paramKeys: ["command", "timeout", "flag", "options", "items"],
                arguments: { command: "private-argument" },
                paramShapes: {
                  command: {
                    kind: "string" as const,
                    len: 20,
                    multiline: true,
                    value: "private-shape",
                  },
                  timeout: { kind: "number" as const, value: 99 },
                  flag: { kind: "boolean" as const, value: true },
                  options: { kind: "object" as const, keyCount: 2, raw: "private-options" },
                  items: { kind: "array" as const, len: 3, raw: "private-items" },
                },
              },
            ],
          },
        ],
      };
      const result = buildForensicsResult(source, query);
      const expected = {
        pattern: "hotspots",
        sessionsScanned: 12,
        turnsAnalyzed: 300,
        findings: [
          {
            sessionId,
            turnIndex: 2,
            currentRate: 30,
            drop: 20,
            cause: { type: "model_change", model: "public-model" },
            toolsBefore: [
              {
                toolName: "bash",
                paramKeys: ["command", "timeout", "flag", "options", "items"],
                paramShapes: {
                  command: { kind: "string", len: 20, multiline: true },
                  timeout: { kind: "number" },
                  flag: { kind: "boolean" },
                  options: { kind: "object", keyCount: 2 },
                  items: { kind: "array", len: 3 },
                },
              },
            ],
            missedTokens: 4000,
            missedCost: 0.123457,
            modelChanged: false,
          },
        ],
      };
      if (spill) {
        expect(result.structuredContent).toMatchObject({ truncated: true });
        expect(result.structuredContent).not.toHaveProperty("findings");
        expect(result.structuredContent).not.toHaveProperty("breakdown");
        const saved = readSpill(result.details?.fullOutputPath);
        expect(JSON.parse(saved)).toStrictEqual(expected);
        expect(saved).not.toContain("private-");
      } else {
        expect(result.structuredContent).toStrictEqual(expected);
      }
      expect(result.content).toEqual([
        { type: "text", text: JSON.stringify(result.structuredContent, null, 2) },
      ]);
      expect(JSON.parse(JSON.stringify(result.structuredContent))).toStrictEqual(
        result.structuredContent,
      );
      expect(JSON.stringify(result)).not.toContain("private-");
      expect(source.findings[0]._pathsInvolved).toEqual(["private-path"]);
    },
  );

  it("returns a summary envelope when the result exceeds the line limit", () => {
    // The engine has already applied the caller's finding limit before this seam.
    const findings = Array.from({ length: 80 }, (_, i) => makeFinding(`session-${i}`, i));
    const result = { ...makeResult(findings), findingsTotal: 410, findingsLimit: 80 };
    const output = boundForensicsOutput(result, { ...query, limit: 80 });

    const full = JSON.stringify(result, null, 2);
    expect(full.split("\n").length).toBeGreaterThan(2_000);
    expect(Buffer.byteLength(full, "utf-8")).toBeLessThan(51_200);

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
    expect(parsed.limit).toBe(80);
    expect(parsed.findingsTotal).toBe(410);
    expect(parsed.findingsLimit).toBe(80);
    expect(parsed.sessionsScanned).toBe(12);
    expect(parsed.turnsAnalyzed).toBe(300);

    expect(output.structuredContent).toStrictEqual(parsed);
    expect(parsed).not.toHaveProperty("findings");
    expect(parsed).not.toHaveProperty("breakdown");
    // The complete query-limited public result lives only in the spill file.
    expect(readSpill(output.fullOutputPath)).toBe(full);
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
    expect(output.structuredContent).toStrictEqual(parsed);
    expect(parsed).not.toHaveProperty("findings");
    expect(parsed).not.toHaveProperty("breakdown");
    expect(parsed).not.toHaveProperty("findingsTotal");
    expect(parsed).not.toHaveProperty("findingsLimit");
    expect(readSpill(output.fullOutputPath)).toBe(full);
  });
});
