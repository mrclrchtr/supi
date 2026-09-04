import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listAll: vi.fn(),
  parseSessionFile: vi.fn(),
  getActiveBranchEntries: vi.fn(),
  extractCacheTurnEntries: vi.fn(),
  extractToolCallWindows: vi.fn(),
  findPreviousComparableTurn: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  SessionManager: { listAll: mocks.listAll },
}));

vi.mock("@mrclrchtr/supi-core/session", () => ({
  getActiveBranchEntries: mocks.getActiveBranchEntries,
}));

vi.mock("../../../src/forensics/extract.ts", () => ({
  extractCacheTurnEntries: mocks.extractCacheTurnEntries,
  extractToolCallWindows: mocks.extractToolCallWindows,
  findPreviousComparableTurn: mocks.findPreviousComparableTurn,
  parseSessionFile: mocks.parseSessionFile,
}));

import { runForensics } from "../../../src/forensics/forensics.ts";

const turns = [
  {
    turnIndex: 1,
    cacheRead: 900,
    cacheWrite: 0,
    input: 100,
    hitRate: 90,
    timestamp: 1000,
  },
  {
    turnIndex: 2,
    cacheRead: 100,
    cacheWrite: 0,
    input: 900,
    hitRate: 10,
    timestamp: 2000,
  },
  {
    turnIndex: 3,
    cacheRead: 50,
    cacheWrite: 0,
    input: 950,
    hitRate: 5,
    timestamp: 3000,
  },
];

beforeEach(() => {
  mocks.listAll.mockResolvedValue([
    { id: "session-1", path: "/session-1.jsonl", modified: new Date() },
  ]);
  mocks.parseSessionFile.mockResolvedValue([]);
  mocks.getActiveBranchEntries.mockReturnValue([]);
  mocks.extractCacheTurnEntries.mockReturnValue(turns);
  mocks.extractToolCallWindows.mockReturnValue(new Map());
  mocks.findPreviousComparableTurn.mockImplementation((records, index) =>
    index > 0 ? records[index - 1] : undefined,
  );
});

describe("runForensics", () => {
  it("limits list results and reports the omitted finding count", async () => {
    const result = await runForensics({
      pattern: "hotspots",
      since: "7d",
      maxFindings: 1,
      regressionThreshold: 0,
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings?.[0].drop).toBe(80);
    expect(result.findingsTotal).toBe(2);
    expect(result.findingsLimit).toBe(1);
  });
});
